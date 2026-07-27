import type { ProblemDetails } from '@openkeep/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';

const PROBLEM_TYPE_BASE = 'https://openkeep.dev/errors';

function send(reply: FastifyReply, problem: ProblemDetails) {
  return reply
    .status(problem.status)
    .header('content-type', 'application/problem+json; charset=utf-8')
    .send(JSON.stringify(problem));
}

export interface ErrorHandlerOptions {
  /**
   * Serves the SPA shell for unmatched GETs outside /api/ (production only).
   * Injected here because Fastify allows one not-found handler per prefix.
   */
  spaFallback?: (req: FastifyRequest, reply: FastifyReply) => unknown;
}

export function registerErrorHandler(app: FastifyInstance, opts: ErrorHandlerOptions = {}): void {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = req.id;

    if (err instanceof AppError) {
      return send(reply, {
        type: `${PROBLEM_TYPE_BASE}/${err.code}`,
        title: err.title,
        status: err.status,
        code: err.code,
        ...(err.detail !== undefined ? { detail: err.detail } : {}),
        ...(err.fieldErrors !== undefined ? { errors: err.fieldErrors } : {}),
        requestId,
      });
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      return send(reply, {
        type: `${PROBLEM_TYPE_BASE}/validation_failed`,
        title: 'Request validation failed',
        status: 400,
        code: 'validation_failed',
        errors: err.validation.map((v) => ({
          path: v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
          message: v.message ?? 'Invalid value',
        })),
        requestId,
      });
    }

    if (isResponseSerializationError(err)) {
      req.log.error({ err, requestId }, 'response serialization failed');
      return send(reply, {
        type: `${PROBLEM_TYPE_BASE}/internal_error`,
        title: 'Internal Server Error',
        status: 500,
        code: 'internal_error',
        requestId,
      });
    }

    // Fastify-generated errors that carry a meaningful status (rate limit,
    // body too large, malformed JSON, …).
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? Number((err as { statusCode?: number }).statusCode)
        : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      const message = err instanceof Error ? err.message : 'Request failed';
      const code =
        statusCode === 429
          ? 'rate_limited'
          : statusCode === 413
            ? 'payload_too_large'
            : 'bad_request';
      return send(reply, {
        type: `${PROBLEM_TYPE_BASE}/${code}`,
        title: message,
        status: statusCode,
        code,
        requestId,
      });
    }

    req.log.error({ err, requestId }, 'unhandled error');
    return send(reply, {
      type: `${PROBLEM_TYPE_BASE}/internal_error`,
      title: 'Internal Server Error',
      status: 500,
      code: 'internal_error',
      requestId,
    });
  });

  app.setNotFoundHandler((req, reply) => {
    if (opts.spaFallback && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return opts.spaFallback(req, reply);
    }
    return send(reply, {
      type: `${PROBLEM_TYPE_BASE}/not_found`,
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      requestId: req.id,
    });
  });
}
