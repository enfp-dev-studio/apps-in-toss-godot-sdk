// SDK 최소 버전 정책(Unity SDK 3.9.0 AITDeprecationChecker 대응). 정본은 SDK 저장소 main의 sdk-policy.json이다.
//   { "schemaVersion": 1, "minVersion": "0.2.0", "deniedVersions": ["0.1.3"] }
// 설치된 애드온 판이 minVersion보다 낮거나 deniedVersions에 있으면 빌드(doctor --strict)를 멈춘다.
// 정책을 받지 못하면(오프라인 등) 막지 않고 "확인하지 못함"으로 알린다.
export const SDK_REPOSITORY = 'https://github.com/enfp-dev-studio/apps-in-toss-godot-sdk';
export const POLICY_URL = 'https://raw.githubusercontent.com/enfp-dev-studio/apps-in-toss-godot-sdk/main/sdk-policy.json';
const TIMEOUT_MS = 10_000;

function parts(version) {
  const m = String(version).match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

export function compareVersions(a, b) {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) throw new Error(`버전 형식이 아닙니다: ${a} / ${b}`);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

// { status: 'ok' | 'blocked' | 'unknown', message }
export function judgePolicy(installed, policy) {
  if (!policy || typeof policy.minVersion !== 'string' || !parts(policy.minVersion)) {
    return { status: 'unknown', message: 'SDK 정책 파일의 모양이 맞지 않아 최소 버전을 확인하지 못했습니다.' };
  }
  const denied = Array.isArray(policy.deniedVersions) ? policy.deniedVersions.map(String) : [];
  if (denied.includes(installed)) {
    return { status: 'blocked', message: `Apps in Toss Godot SDK ${installed}은 사용 중지된 판입니다. 최신 판으로 올리세요: ait-godot update` };
  }
  if (compareVersions(installed, policy.minVersion) < 0) {
    return { status: 'blocked', message: `Apps in Toss Godot SDK ${installed}은 최소 판 ${policy.minVersion}보다 낮습니다. 최신 판으로 올리세요: ait-godot update` };
  }
  return { status: 'ok', message: `SDK ${installed} (최소 ${policy.minVersion})` };
}

export async function fetchPolicy(fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(POLICY_URL, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkSdkPolicy(installed, fetchImpl) {
  const policy = await fetchPolicy(fetchImpl);
  if (policy === null) return { status: 'unknown', message: 'SDK 최소 버전 정책을 받지 못해 확인하지 못했습니다(네트워크).' };
  return judgePolicy(installed, policy);
}
