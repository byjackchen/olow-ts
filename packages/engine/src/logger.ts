import pino, { type Logger } from 'pino';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getContext } from './context.js';

export type { Logger } from 'pino';

// ─── Config ───

export interface LoggerConfig {
  app_log_path: string;
  base_log_level: string;
  isDev?: boolean;
}

// ─── Factory ───

export function createLogger(opts: LoggerConfig): Logger {
  const logDir = dirname(opts.app_log_path);
  mkdirSync(logDir, { recursive: true });

  return pino({
    level: opts.base_log_level,
    mixin() {
      const ctx = getContext();
      if (!ctx) return {};
      return {
        cycleId: ctx.cycleId,
        requesterType: ctx.requesterType,
        requesterId: ctx.requesterId,
        sessionId: ctx.sessionId,
      };
    },
    transport: {
      targets: [
        ...(opts.isDev
          ? [{ target: 'pino-pretty', level: opts.base_log_level, options: { colorize: true } }]
          : [{ target: 'pino/file', level: opts.base_log_level, options: { destination: 1 } }]),
        {
          target: 'pino/file',
          level: opts.base_log_level,
          options: { destination: opts.app_log_path, mkdir: true },
        },
      ],
    },
  });
}

// ─── Singleton ───

let _logger: Logger | null = null;

export function setLogger(l: Logger): void {
  _logger = l;
}

export function getLogger(): Logger {
  if (!_logger) {
    _logger = pino({ level: 'info' });
  }
  return _logger;
}
