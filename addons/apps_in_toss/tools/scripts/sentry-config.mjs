// Sentry 연동(Unity SDK 3.9.0 Sentry 통합 대응) 설정을 게임 매니페스트에서 읽는다.
//   "sentry": { "dsn": "https://…@….ingest.sentry.io/…", "environment": "production", "release": "1.2.0", "sampleRate": 1 }
// dsn이 있는 게임만 빌드가 dist/ait-sentry.js를 만들어 브리지 다음에 넣는다(DSN은 공개값).
// environment를 비우면 빌드 종류로 정한다: 출시 production, 테스트(--debug-console) test, 개발(build:dev) development.
import fs from 'node:fs';
import path from 'node:path';

export const SENTRY_EXPORT_FILE = 'ait-sentry.js';

export function readSentryConfig(gameDir) {
  const manifestPath = path.join(gameDir, '.ait/game.manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const sentry = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).sentry;
  if (sentry === undefined) return null;
  if (typeof sentry !== 'object' || sentry === null || Array.isArray(sentry)) {
    throw new Error('Game manifest sentry must be an object.');
  }
  if (typeof sentry.dsn !== 'string' || !/^https:\/\/[^@\s]+@[^\s]+\/\d+$/.test(sentry.dsn)) {
    throw new Error('Game manifest sentry.dsn must be a Sentry DSN (https://<key>@<host>/<project id>).');
  }
  for (const key of ['environment', 'release']) {
    if (sentry[key] !== undefined && typeof sentry[key] !== 'string') {
      throw new Error(`Game manifest sentry.${key} must be a string.`);
    }
  }
  if (sentry.sampleRate !== undefined && !(typeof sentry.sampleRate === 'number' && sentry.sampleRate >= 0 && sentry.sampleRate <= 1)) {
    throw new Error('Game manifest sentry.sampleRate must be a number from 0 to 1.');
  }
  return {
    dsn: sentry.dsn,
    environment: sentry.environment,
    release: sentry.release,
    sampleRate: sentry.sampleRate,
  };
}

// kind: 'production' | 'test' | 'development'
export function sentryBuildEnv(config, kind) {
  return { AIT_SENTRY_CONFIG: JSON.stringify({ ...config, environment: config.environment ?? kind }) };
}
