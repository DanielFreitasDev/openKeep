import type { ProblemDetails } from '@openkeep/shared';
import { clientId } from './client-id.js';

export class ApiError extends Error {
  readonly problem: ProblemDetails;
  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }
  get code() {
    return this.problem.code;
  }
  get status() {
    return this.problem.status;
  }
}

async function parseProblem(res: Response): Promise<ProblemDetails> {
  try {
    const body = (await res.json()) as ProblemDetails;
    if (body && typeof body.status === 'number' && typeof body.code === 'string') return body;
  } catch {
    // fall through
  }
  return {
    type: 'about:blank',
    title: res.statusText || 'Request failed',
    status: res.status,
    code: res.status === 401 ? 'unauthorized' : 'internal_error',
  };
}

/** Same-origin JSON fetch with problem-details errors and the X-Client-Id header. */
export async function api<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      'x-client-id': clientId,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new ApiError(await parseProblem(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
