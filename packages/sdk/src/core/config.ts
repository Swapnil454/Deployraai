export interface SDKConfig {
  projectId: string;
  token: string;
  collectorUrl: string;
  environment: string;
  deployId: string;
  debug: boolean;
  sampleRate: number; // 0.0 to 1.0, default 1.0
}

export function loadConfig(): SDKConfig {
  // These env vars are injected by your platform at deploy time.
  // The user never sets these manually.
  const projectId = process.env.TRACEPILOT_PROJECT_ID ?? '';
  const token = process.env.TRACEPILOT_TOKEN;
  const collectorUrl = process.env.TRACEPILOT_INGESTOR_URL || 'https://ingestor.deployai.in';

  if (!token) {
    // SDK is silently disabled if not deployed via your platform.
    // This means local dev works fine with zero errors.
    return {
      projectId: '',
      token: '',
      collectorUrl: '',
      environment: 'local',
      deployId: 'local',
      debug: false,
      sampleRate: 0, // disabled
    };
  }

  return {
    projectId,
    token,
    collectorUrl,
    environment: process.env.YOURPLATFORM_ENV ?? 'production',
    deployId: process.env.YOURPLATFORM_DEPLOY_ID ?? 'unknown',
    debug: process.env.YOURPLATFORM_DEBUG === 'true',
    sampleRate: parseFloat(process.env.YOURPLATFORM_SAMPLE_RATE ?? '1.0'),
  };
}

// Singleton so config is loaded once
let _config: SDKConfig | null = null;
export function getConfig(): SDKConfig {
  if (!_config) _config = loadConfig();
  return _config;
}

export function isEnabled(): boolean {
  return getConfig().sampleRate > 0;
}
