import type { FastifyBaseLogger } from 'fastify';
import { pino } from 'pino';
import type { Config } from '../config.js';

// Returned as FastifyBaseLogger so the FastifyInstance generic stays the
// default and plugins/handlers keep uniform instance types.
export function buildLogger(config: Config): FastifyBaseLogger {
  return pino({
    level: config.isTest ? 'silent' : config.LOG_LEVEL,
    // Note content must never appear above debug level.
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    ...(config.isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}
