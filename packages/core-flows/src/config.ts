export interface ReactAgentConfig {
  intent_mode: string;
  max_rounds: number;
  specialized_score_threshold: number;
}

const DEFAULT_CONFIG: ReactAgentConfig = {
  intent_mode: 'multi-turns',
  max_rounds: 5,
  specialized_score_threshold: 1.0,
};

let _config: ReactAgentConfig = DEFAULT_CONFIG;

export function setReactAgentConfig(cfg: ReactAgentConfig): void {
  _config = cfg;
}

export function getReactAgentConfig(): ReactAgentConfig {
  return _config;
}
