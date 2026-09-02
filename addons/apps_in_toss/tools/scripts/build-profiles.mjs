// Build profiles — Unity SDK 빌드 프로필(Dev Server / 배포)에 대응하는 단일 출처.
//
// game.manifest.json의 releaseChannel이 프로필을 결정한다:
//   sandbox  개발·기기 테스트. doctor advisory 허용, mock devtools 사용 가능.
//   canary   배포 직전 검증. strict doctor 필수, mock 금지.
//   production 정식 출시. strict doctor 필수, mock 금지.
//
// 검증 로직 자체는 ait-doctor.mjs가 담당하고, 여기서는 채널→정책 매핑만 제공한다.
import fs from 'node:fs';
import path from 'node:path';

const PROFILES = {
  sandbox: { label: 'Sandbox', doctorStrict: false, mockAllowed: true },
  canary: { label: 'Canary', doctorStrict: true, mockAllowed: false },
  production: { label: 'Production', doctorStrict: true, mockAllowed: false },
};

export function loadGameManifest(projectDir, fallbackDir) {
  const candidates = [
    path.join(projectDir, '.ait/game.manifest.json'),
    path.join(fallbackDir, '.ait/game.manifest.json'),
    path.join(fallbackDir, '.ait/game.manifest.example.json'),
  ];
  const manifestPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!manifestPath) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

export function resolveProfile(projectDir, fallbackDir, manifestOverride = null) {
  const manifest = manifestOverride ?? loadGameManifest(projectDir, fallbackDir);
  const channel = manifest?.releaseChannel ?? 'sandbox';
  const profile = PROFILES[channel] ?? PROFILES.sandbox;
  return { channel, profile, manifest };
}

export function logProfileBanner({ channel, profile }) {
  console.log('[AIT] ========================================');
  console.log(`[AIT] 빌드 프로필: ${profile.label} (${channel})`);
  console.log(`[AIT]   doctor 모드: ${profile.doctorStrict ? 'strict' : 'advisory or strict'}`);
  console.log(`[AIT]   mock devtools: ${profile.mockAllowed ? '허용(개발 전용)' : '금지'}`);
  console.log('[AIT] ========================================');
}