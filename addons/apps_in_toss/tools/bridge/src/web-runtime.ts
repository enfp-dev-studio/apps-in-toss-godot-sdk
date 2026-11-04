// 웹 실행 보조 — 엔진(index.js)보다 먼저 실행되는 브리지에 들어 있다.
//
// 1. 화면 떠남·돌아옴(항상): 토스 WebView에서는 visibilitychange만으로 놓치는 경우가 있었다
//    (hidden만 오고 visible이 안 옴, 처음부터 hidden, iOS 18.7은 AudioContext interrupted가 먼저 옴).
//    여러 신호를 모아 상태를 바꾸는 첫 신호 하나만 쓰고 나머지는 기록만 한다. 손을 떼면 돌아온 것으로 본다.
// 2. 소리 풀기(항상): WKWebView는 running이어도 첫 터치 전에는 소리가 안 날 수 있어, 첫 터치에
//    resume()하고 1샘플 무음을 튼다. 위치 워크릿(addModule)을 못 부르면 Blob URL로 다시 시도하고,
//    4초 안에 안 되면 소리 없는 대역 노드를 쓴다(그대로 두면 모든 샘플이 시작되지 않는다).
// 3. iOS 복귀 소리 복구(audioRecovery(true)일 때만, 실기기 미검증): iOS는 백그라운드에서 돌아와
//    resume()해도 currentTime이 멈춰 소리가 안 나고, 누르면 밀린 소리가 한꺼번에 난다.
//    떠날 때 0.01초 페이드 뒤 직접 suspend()하고, 돌아온 뒤 첫 터치에 다시 켜서 0.6초 동안
//    currentTime이 움직이지 않으면 엔진 패치의 GodotAudio.aitRecreate()로 컨텍스트를 새로 만든다.
//
// 엔진 쪽 훅(window.__godotAudio, aitOutput, aitRecreate, __aitAudioHooks)은
// addons/apps_in_toss/tools/scripts/engine-patch.mjs가 내보낸 index.js에 넣는다.

export type LifeState = 'hidden' | 'visible';
export type RuntimeEvent =
  | { kind: 'life'; state: LifeState; source: string; at: number }
  | { kind: 'audio'; state: 'resumed' | 'renewed' | 'failed'; at: number };

interface GodotAudioLike {
  ctx: AudioContext | null;
  aitOutput?: () => GainNode;
  aitRecreate?: () => AudioContext | null;
}

type RuntimeWindow = Window & {
  __godotAudio?: GodotAudioLike;
  __aitAudioHooks?: {
    loadPositionWorklet: (ctx: AudioContext, path: string) => Promise<void>;
    positionWorkletNode: (ctx: AudioContext) => AudioNode | null;
  };
};

const SIGNAL_LOG_LIMIT = 50;
const POSITION_WORKLET_TIMEOUT_MS = 4000;
const FADE_SECONDS = 0.01;
const SUSPEND_AFTER_MS = 30;
const STALL_CHECK_MS = 600;
const STALL_MIN_ADVANCE = 0.05;

export function installWebRuntime(win: RuntimeWindow) {
  const doc: Document | undefined = (win as { document?: Document }).document;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const listeners = new Set<(event: RuntimeEvent) => void>();
  const pending: RuntimeEvent[] = [];
  const signals: { signal: string; state: LifeState; at: number; used: boolean }[] = [];
  let state: LifeState = doc?.visibilityState === 'hidden' ? 'hidden' : 'visible';
  let source = 'initial';
  let recoveryEnabled = false;
  let needsCheck = false;
  let expectSuspend = false;
  const unlocked = new WeakSet<AudioContext>();
  const watched = new WeakSet<AudioContext>();
  const lastState = new WeakMap<AudioContext, AudioContextState | string>();
  const fallbackWorklet = new WeakSet<AudioContext>();

  function publish(event: RuntimeEvent) {
    if (listeners.size === 0) {
      pending.push(event);
      return;
    }
    for (const listener of listeners) listener(event);
  }

  // 상태를 바꾸는 첫 신호만 쓴다. 같은 상태의 뒤늦은 신호는 기록만 한다.
  function signal(name: string, next: LifeState) {
    const used = next !== state;
    signals.push({ signal: name, state: next, at: Math.round(now()), used });
    if (signals.length > SIGNAL_LOG_LIMIT) signals.shift();
    if (!used) return;
    state = next;
    source = name;
    publish({ kind: 'life', state, source, at: Math.round(now()) });
    if (state === 'hidden') onHidden(name);
  }

  function godotAudio() {
    return win.__godotAudio;
  }

  function playSilent(ctx: AudioContext) {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      node.start(0);
    } catch {
      // 닫힌 컨텍스트 등은 무시한다.
    }
  }

  // 엔진 컨텍스트의 상태 변화를 본다. 스스로 멈춘 것(expectSuspend)은 신호로 쓰지 않는다.
  function watch(ctx: AudioContext | null | undefined) {
    if (!ctx || watched.has(ctx) || typeof ctx.addEventListener !== 'function') return;
    watched.add(ctx);
    lastState.set(ctx, ctx.state);
    ctx.addEventListener('statechange', () => {
      const previous = lastState.get(ctx);
      const current = ctx.state as string;
      lastState.set(ctx, current);
      if (current === 'suspended' && expectSuspend) {
        expectSuspend = false;
        return;
      }
      if (previous === 'running' && (current === 'suspended' || current === 'interrupted')) {
        signal(`audio-${current}`, 'hidden');
      }
    });
  }

  function setFader(value: number, seconds = 0) {
    const audio = godotAudio();
    const ctx = audio?.ctx;
    if (!ctx || typeof audio?.aitOutput !== 'function') return;
    const gain = audio.aitOutput().gain;
    const t = ctx.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    if (seconds > 0) gain.linearRampToValueAtTime(value, t + seconds);
    else gain.setValueAtTime(value, t);
  }

  function onHidden(name: string) {
    if (!recoveryEnabled) return;
    const ctx = godotAudio()?.ctx;
    if (!ctx) return;
    needsCheck = true;
    const suspend = () => {
      if (godotAudio()?.ctx !== ctx || ctx.state !== 'running') return;
      expectSuspend = true;
      ctx.suspend().catch(() => {
        expectSuspend = false;
      });
    };
    // interrupted는 이미 끊긴 뒤라 기다리지 않고 바로 0으로 줄이고 멈춘다.
    if (name === 'audio-interrupted') {
      setFader(0);
      suspend();
      return;
    }
    setFader(0, FADE_SECONDS);
    setTimeout(suspend, SUSPEND_AFTER_MS);
  }

  // 돌아온 뒤 첫 터치: 다시 켜고, 시간이 흐르지 않으면 컨텍스트를 새로 만든다.
  function checkAfterReturn() {
    needsCheck = false;
    const audio = godotAudio();
    const ctx = audio?.ctx;
    if (!audio || !ctx) return;
    setFader(1);
    ctx.resume().catch(() => {});
    playSilent(ctx);
    const startedAt = ctx.currentTime;
    setTimeout(() => {
      if (audio.ctx !== ctx) return;
      if (ctx.currentTime - startedAt >= STALL_MIN_ADVANCE) {
        publish({ kind: 'audio', state: 'resumed', at: Math.round(now()) });
        return;
      }
      const renewed = typeof audio.aitRecreate === 'function' ? audio.aitRecreate() : null;
      if (!renewed) {
        publish({ kind: 'audio', state: 'failed', at: Math.round(now()) });
        return;
      }
      watch(renewed);
      renewed.resume().catch(() => {});
      playSilent(renewed);
      unlocked.add(renewed);
      publish({ kind: 'audio', state: 'renewed', at: Math.round(now()) });
    }, STALL_CHECK_MS);
  }

  function onTouch() {
    const ctx = godotAudio()?.ctx;
    watch(ctx);
    if (ctx && !unlocked.has(ctx)) {
      unlocked.add(ctx);
      ctx.resume().catch(() => {});
      playSilent(ctx);
    }
    signal('touch', 'visible');
    if (recoveryEnabled && needsCheck && state === 'visible') checkAfterReturn();
  }

  // 위치 워크릿: addModule → Blob URL → 4초 뒤 대역 노드.
  win.__aitAudioHooks = {
    loadPositionWorklet(ctx: AudioContext, path: string) {
      watch(ctx);
      const viaBlob = () =>
        fetch(path)
          .then((response) => response.text())
          .then((text) => {
            const url = URL.createObjectURL(new Blob([text], { type: 'application/javascript' }));
            return ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
          });
      const load = ctx.audioWorklet.addModule(path).catch(viaBlob).then(() => 'ok' as const);
      const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), POSITION_WORKLET_TIMEOUT_MS));
      return Promise.race([load, timeout])
        .catch(() => 'failed' as const)
        .then((result) => {
          if (result === 'ok') return;
          fallbackWorklet.add(ctx);
          console.warn(`[AIT audio] position worklet ${result}; playback position will not be reported.`);
        });
    },
    positionWorkletNode(ctx: AudioContext) {
      if (!fallbackWorklet.has(ctx)) return null;
      // 출력에 잇지 않는 GainNode라 소리가 나지 않는다. 엔진이 쓰는 port·parameters만 흉내 낸다.
      const node = ctx.createGain();
      const reset = { setValueAtTime: () => reset };
      Object.assign(node, {
        port: { postMessage() {}, onmessage: null },
        parameters: new Map([['reset', reset]]),
      });
      return node;
    },
  };

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      signal('visibilitychange', doc.visibilityState === 'hidden' ? 'hidden' : 'visible');
    });
  }
  if (typeof win.addEventListener === 'function') {
    win.addEventListener('pagehide', () => signal('pagehide', 'hidden'));
    win.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted) signal('pageshow', 'visible');
    });
    win.addEventListener('blur', () => signal('blur', 'hidden'));
    win.addEventListener('focus', () => signal('focus', 'visible'));
    for (const type of ['touchend', 'click', 'keydown']) {
      win.addEventListener(type, onTouch, { capture: true, passive: true });
    }
  }

  return {
    // 붙기 전에 쌓인 이벤트를 순서대로 보낸 뒤 현재 상태를 한 번 알리고, 이후 이벤트를 보낸다.
    subscribe(listener: (event: RuntimeEvent) => void) {
      for (const event of pending.splice(0)) listener(event);
      listener({ kind: 'life', state, source, at: Math.round(now()) });
      listeners.add(listener);
    },
    state() {
      return { state, source, recovery: recoveryEnabled, signals: signals.slice() };
    },
    setRecovery(enabled: boolean) {
      recoveryEnabled = enabled;
      watch(godotAudio()?.ctx);
      if (!enabled) needsCheck = false;
    },
  };
}
