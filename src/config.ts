export interface Config {
  host: string;
  port: number;
  evaluator: 'disabled' | 'demo' | 'jev';
  demoMode: boolean;
  apiKey?: string;
  allowRemoteContent: boolean;
  jevApiKey?: string;
  jevEndpoint: string;
  jevModel: string;
  otlpEndpoint?: string;
  otlpAuth?: string;
  evaluationTimeoutMs: number;
  exportTimeoutMs: number;
  concurrency: number;
  maxQueue: number;
  cacheSize: number;
  cacheTtlMs: number;
  maxInflightRequests: number;
  bodyLimit: number;
  maxSpans: number;
  maxDepth: number;
  cohorts: readonly string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[`OSG_${name}`];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw new Error(`OSG_${name} must be an integer`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`OSG_${name} is out of range`);
    return value;
  };
  const flag = (name: string): boolean => {
    const raw = env[`OSG_${name}`];
    if (raw === undefined || raw === 'false') return false;
    if (raw === 'true') return true;
    throw new Error(`OSG_${name} must be true or false`);
  };
  const endpoint = (name: string, fallback?: string): string | undefined => {
    const raw = env[`OSG_${name}`] ?? fallback;
    if (raw === undefined) return undefined;
    let parsed: URL;
    try { parsed = new URL(raw); } catch { throw new Error(`OSG_${name} must be an HTTP(S) URL`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || parsed.search) {
      throw new Error(`OSG_${name} must be an HTTP(S) URL without credentials, query or fragment`);
    }
    if (name === 'OTLP_ENDPOINT' && !parsed.pathname.endsWith('/v1/traces')) throw new Error('OSG_OTLP_ENDPOINT must end with /v1/traces');
    return parsed.href;
  };
  const secret = (name: string): string | undefined => {
    const raw = env[`OSG_${name}`];
    if (raw !== undefined && (raw.length < 1 || raw.length > 4096 || /[\r\n\x00-\x1f\x7f]/.test(raw))) throw new Error(`OSG_${name} is invalid`);
    return raw;
  };
  const host = env.OSG_HOST ?? '127.0.0.1';
  if (!host || host.length > 253 || /[\s\/@?#]/.test(host)) throw new Error('OSG_HOST is invalid');
  const demoMode = flag('DEMO_MODE');
  const apiKey = secret('API_KEY');
  if (apiKey && apiKey.length < 32) throw new Error('OSG_API_KEY must contain at least 32 characters');
  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !apiKey && !demoMode) throw new Error('OSG_API_KEY is required for a non-loopback listener');
  const evaluator = env.OSG_EVALUATOR ?? 'disabled';
  if (!['disabled', 'demo', 'jev'].includes(evaluator)) throw new Error('OSG_EVALUATOR must be disabled, demo or jev');
  const allowRemoteContent = flag('ALLOW_REMOTE_CONTENT');
  const jevApiKey = secret('JEV_API_KEY');
  if (evaluator === 'jev' && (!allowRemoteContent || !jevApiKey)) throw new Error('Jev requires OSG_JEV_API_KEY and OSG_ALLOW_REMOTE_CONTENT=true');
  const jevEndpoint = endpoint('JEV_ENDPOINT', 'https://api.typesafe.ai/v1/systemone')!;
  const parsedJev = new URL(jevEndpoint);
  if (parsedJev.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsedJev.hostname)) throw new Error('OSG_JEV_ENDPOINT requires HTTPS outside loopback');
  const jevModel = env.OSG_JEV_MODEL ?? 'jev-latest';
  if (!/^[a-zA-Z0-9._:/-]{1,128}$/.test(jevModel)) throw new Error('OSG_JEV_MODEL is invalid');
  const otlpEndpoint = endpoint('OTLP_ENDPOINT');
  if (!otlpEndpoint && !demoMode) throw new Error('OSG_OTLP_ENDPOINT is required unless OSG_DEMO_MODE=true');
  const otlpAuth = secret('OTLP_AUTH');
  const cohorts = (env.OSG_COHORTS ?? 'default,demo,canary').split(',');
  if (cohorts.length > 20 || !cohorts.includes('default') || cohorts.some(value => !/^[a-zA-Z0-9_-]{1,32}$/.test(value)) || new Set(cohorts).size !== cohorts.length) throw new Error('OSG_COHORTS must be unique safe labels including default (maximum 20)');
  return {
    host, port: integer('PORT', 4318, 0, 65535), evaluator: evaluator as Config['evaluator'], demoMode,
    ...(apiKey ? { apiKey } : {}), allowRemoteContent, ...(jevApiKey ? { jevApiKey } : {}), jevEndpoint, jevModel,
    ...(otlpEndpoint ? { otlpEndpoint } : {}), ...(otlpAuth ? { otlpAuth } : {}),
    evaluationTimeoutMs: integer('EVALUATION_TIMEOUT_MS', 1000, 10, 60000),
    exportTimeoutMs: integer('EXPORT_TIMEOUT_MS', 5000, 10, 60000),
    concurrency: integer('CONCURRENCY', 8, 1, 128), maxQueue: integer('MAX_QUEUE', 128, 0, 4096),
    cacheSize: integer('CACHE_SIZE', 10000, 1, 100000), cacheTtlMs: integer('CACHE_TTL_MS', 600000, 100, 86400000),
    maxInflightRequests: integer('MAX_INFLIGHT_REQUESTS', 32, 1, 256),
    bodyLimit: integer('BODY_LIMIT', 2097152, 1024, 8388608), maxSpans: integer('MAX_SPANS', 128, 1, 1024),
    maxDepth: integer('MAX_DEPTH', 32, 4, 40), cohorts,
  };
}
