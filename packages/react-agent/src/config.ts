export interface ReactAgentConfig {
  intent_mode: string;
  max_rounds: number;
}

const DEFAULT_CONFIG: ReactAgentConfig = {
  intent_mode: 'multi-turns',
  max_rounds: 5,
};

let _config: ReactAgentConfig = DEFAULT_CONFIG;

export function setReactAgentConfig(cfg: ReactAgentConfig): void {
  _config = cfg;
}

export function getReactAgentConfig(): ReactAgentConfig {
  return _config;
}
