// 개발용 Godot Metrics 탭(Unity SDK 3.9.0 템플릿의 Unity Metrics 탭 대응, 코드는 이 SDK가 새로 씀).
// 토스 웹 디버그 툴즈가 페이지에 vConsole(window.__VCONSOLE_INSTANCE)을 넣었을 때만 탭을 붙인다.
// 없으면(라이브·로컬 브라우저) 화면·프레임 루프를 만들지 않고, 최근 기록 200개만 메모리에 둔다.
// 기록: 런타임 로그(AITRuntimeLog의 godot_*)와 게임이 부른 eventLog·Analytics.* 호출.
// vConsole 플러그인 클래스는 인스턴스의 constructor.VConsolePlugin으로 얻는다(문서에 없는 경로라 실패해도 게임에는 영향 없음).

type Category = 'runtime' | 'event';
interface MetricsEntry {
  at: number;
  category: Category;
  name: string;
  params: unknown;
}
interface VConsolePluginLike {
  on(event: string, handler: (...args: unknown[]) => void): void;
}
type VConsolePluginCtor = new (id: string, name: string) => VConsolePluginLike;
interface VConsoleLike {
  addPlugin(plugin: VConsolePluginLike): void;
  constructor: { VConsolePlugin?: VConsolePluginCtor };
}

const MAX_ENTRIES = 200;
const WATCH_MS = 1000;
const WATCH_LIMIT = 60;

export interface Metrics {
  record(category: Category, name: string, params: unknown): void;
}

export function installMetrics(win: Window & { __VCONSOLE_INSTANCE?: VConsoleLike }): Metrics {
  const entries: MetricsEntry[] = [];
  const counts = new Map<string, number>();
  const startedAt = Date.now();
  let render: (() => void) | null = null;
  let filter: 'all' | Category = 'all';
  let fps = 0;
  let frames = 0;
  let fpsWindowStart = 0;
  let rafId = 0;

  const metrics: Metrics = {
    record(category, name, params) {
      entries.push({ at: Date.now(), category, name, params });
      if (entries.length > MAX_ENTRIES) entries.shift();
      counts.set(name, (counts.get(name) ?? 0) + 1);
      render?.();
    },
  };

  const maybeDoc = (win as { document?: Document }).document;
  if (!maybeDoc) return metrics;
  const doc: Document = maybeDoc;

  const text = (tag: string, value: string, style = '') => {
    const el = doc.createElement(tag);
    el.textContent = value;
    if (style) el.setAttribute('style', style);
    return el;
  };
  const elapsed = (at: number) => `+${((at - startedAt) / 1000).toFixed(1)}s`;

  function attach(instance: VConsoleLike) {
    const Plugin = instance.constructor?.VConsolePlugin;
    if (typeof Plugin !== 'function' || typeof instance.addPlugin !== 'function') return;
    const root = doc.createElement('div');
    root.setAttribute('style', 'padding:8px;font:12px/1.5 monospace;');
    const tabs = doc.createElement('div');
    const body = doc.createElement('div');
    for (const value of ['all', 'runtime', 'event'] as const) {
      const button = text('button', value, 'margin:0 4px 6px 0;');
      button.addEventListener('click', () => {
        filter = value;
        render?.();
      });
      tabs.appendChild(button);
    }
    root.append(tabs, body);
    render = () => {
      body.replaceChildren();
      const memory = (win.performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      const stalls = counts.get('godot_frame_stall') ?? 0;
      body.appendChild(
        text(
          'div',
          `FPS ${fps} · JS heap ${memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(1)}MB` : '-'} · 프레임 멈춤 ${stalls}`,
          'font-weight:bold;margin-bottom:6px;',
        ),
      );
      const totals = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`);
      body.appendChild(text('div', totals.join(' · ') || '기록 없음', 'color:#666;margin-bottom:6px;'));
      for (const entry of [...entries].reverse()) {
        if (filter !== 'all' && entry.category !== filter) continue;
        const row = doc.createElement('div');
        row.setAttribute('style', 'border-top:1px solid #eee;padding:2px 0;word-break:break-all;');
        row.append(text('b', `${elapsed(entry.at)} ${entry.name} `), text('span', JSON.stringify(entry.params ?? null)));
        body.appendChild(row);
      }
    };
    // FPS는 탭이 보일 때만 잰다.
    const tick = (now: number) => {
      frames += 1;
      if (now - fpsWindowStart >= 1000) {
        fps = Math.round((frames * 1000) / (now - fpsWindowStart));
        frames = 0;
        fpsWindowStart = now;
        render?.();
      }
      rafId = win.requestAnimationFrame(tick);
    };
    const plugin = new Plugin('godot_metrics', 'Godot Metrics');
    plugin.on('renderTab', (callback) => {
      render?.();
      (callback as (el: HTMLElement) => void)(root);
    });
    plugin.on('show', () => {
      fpsWindowStart = win.performance.now();
      frames = 0;
      rafId = win.requestAnimationFrame(tick);
    });
    plugin.on('hide', () => win.cancelAnimationFrame(rafId));
    instance.addPlugin(plugin);
  }

  let tries = 0;
  const watch = () => {
    try {
      const instance = win.__VCONSOLE_INSTANCE;
      if (instance) {
        attach(instance);
        return;
      }
    } catch {
      return;
    }
    tries += 1;
    if (tries < WATCH_LIMIT) win.setTimeout(watch, WATCH_MS);
  };
  watch();
  return metrics;
}
