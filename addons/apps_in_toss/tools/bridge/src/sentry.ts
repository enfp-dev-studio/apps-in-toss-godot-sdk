// Sentry 연동(Unity SDK 3.9.0 AITSentryIntegration 대응, 코드는 이 SDK가 새로 씀).
// 게임 매니페스트에 sentry.dsn이 있을 때만 ait-godot 빌드가 이 파일을 따로 묶어(dist/ait-sentry.js)
// 브리지 다음에 넣는다. 페이지의 JS 오류는 Sentry가 직접 잡고, Godot 오류·태그·기록은 GDScript(AIT.sentry)가
// window.AppsInTossGodotSentry로 보낸다. DSN은 공개값이다(브라우저 SDK와 같다).
import { addBreadcrumb, captureEvent, init, setContext, setTag, setUser } from '@sentry/browser';

declare const __AIT_SENTRY_CONFIG__: {
  dsn: string;
  environment?: string;
  release?: string;
  sampleRate?: number;
};

type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
const LEVELS: SeverityLevel[] = ['fatal', 'error', 'warning', 'log', 'info', 'debug'];

function parse(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

init({
  dsn: __AIT_SENTRY_CONFIG__.dsn,
  environment: __AIT_SENTRY_CONFIG__.environment,
  release: __AIT_SENTRY_CONFIG__.release,
  sampleRate: __AIT_SENTRY_CONFIG__.sampleRate,
});

(window as Window & { AppsInTossGodotSentry?: unknown }).AppsInTossGodotSentry = {
  setTag(key: string, value: string) {
    setTag(key, value);
  },
  setUser(json: string) {
    setUser(parse(json));
  },
  setContext(name: string, json: string) {
    setContext(name, parse(json));
  },
  addBreadcrumb(json: string) {
    const crumb = parse(json);
    const level = LEVELS.includes(crumb.level as SeverityLevel) ? (crumb.level as SeverityLevel) : 'info';
    addBreadcrumb({
      category: typeof crumb.category === 'string' ? crumb.category : undefined,
      message: typeof crumb.message === 'string' ? crumb.message : undefined,
      level,
      data: crumb.data && typeof crumb.data === 'object' ? (crumb.data as Record<string, unknown>) : undefined,
    });
  },
  // Godot 오류(AITRuntimeLog가 잡은 push_error·스크립트 오류). JS 예외가 아니라 메시지 이벤트로 보낸다.
  captureGodotError(json: string) {
    const error = parse(json);
    captureEvent({
      message: typeof error.message === 'string' ? error.message : 'Godot error',
      level: 'error',
      logger: 'godot',
      tags: { 'godot.error_type': typeof error.kind === 'string' ? error.kind : 'error' },
      extra: { stack_trace: error.stack_trace },
    });
  },
};
