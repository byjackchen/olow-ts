export interface TriageConfig {
  rolling_requests_threshold: number;
}

const DEFAULT_CONFIG: TriageConfig = {
  rolling_requests_threshold: 60,
};

let _config: TriageConfig = DEFAULT_CONFIG;

export function setTriageConfig(cfg: TriageConfig): void {
  _config = cfg;
}

export function getTriageConfig(): TriageConfig {
  return _config;
}
