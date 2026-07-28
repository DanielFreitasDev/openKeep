import type { ProblemDetails } from '@openkeep/shared';

/** RFC 9457 problem details from the OpenKeep REST layer, as a typed error. */
export class OpenKeepApiError extends Error {
  readonly problem: ProblemDetails;
  /** Seconds to wait when `code === 'rate_limited'` (from Retry-After). */
  readonly retryAfter: number | undefined;

  constructor(problem: ProblemDetails, retryAfter?: number) {
    super(problem.detail ?? problem.title);
    this.name = 'OpenKeepApiError';
    this.problem = problem;
    this.retryAfter = retryAfter;
  }

  get code(): string {
    return this.problem.code;
  }

  get status(): number {
    return this.problem.status;
  }
}
