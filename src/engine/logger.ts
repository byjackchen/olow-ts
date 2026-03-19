import pino from 'pino';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config/index.js';
import { getContext } from './context.js';

const logPath = config.engine.logging.app_log_path;
const logDir = dirname(logPath);
mkdirSync(logDir, { recursive: true });

export const logger = pino({
  level: config.engine.logging.base_log_level,
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
      // Console (pretty in dev, JSON in prod)
      ...(config.env === 'LOCAL' || config.env === 'LOCAL_DOCKER'
        ? [{ target: 'pino-pretty', level: config.engine.logging.base_log_level as string, options: { colorize: true } }]
        : [{ target: 'pino/file', level: config.engine.logging.base_log_level as string, options: { destination: 1 } }]),
      // File
      {
        target: 'pino/file',
        level: config.engine.logging.base_log_level as string,
        options: { destination: logPath, mkdir: true },
      },
    ],
  },
});

export default logger;
