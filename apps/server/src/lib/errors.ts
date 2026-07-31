import type { ErrorCode } from '@openkeep/shared';

/**
 * Application error carrying an RFC 9457 problem-details payload.
 * Thrown from services; translated by the global error handler.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly title: string;
  readonly detail: string | undefined;
  readonly fieldErrors: { path: string; message: string }[] | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    title: string,
    detail?: string,
    fieldErrors?: { path: string; message: string }[],
  ) {
    super(detail ?? title);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }
}

export const errors = {
  badRequest: (detail?: string) => new AppError(400, 'bad_request', 'Bad Request', detail),
  unauthorized: (detail?: string) => new AppError(401, 'unauthorized', 'Unauthorized', detail),
  forbidden: (detail?: string) => new AppError(403, 'forbidden', 'Forbidden', detail),
  /** Non-members receive the same 404 as a missing note — no existence oracle. */
  notFound: (detail?: string) => new AppError(404, 'not_found', 'Not Found', detail),
  conflict: (code: ErrorCode, title: string, detail?: string) =>
    new AppError(409, code, title, detail),
  noteTrashed: () =>
    new AppError(409, 'note_trashed', 'Note is in the trash', 'Restore the note to edit it.'),
  /** Shared with view-only permission — distinct from a plain 403 so clients can say so. */
  readOnlyNote: () =>
    new AppError(
      403,
      'note_read_only',
      'View-only access',
      'This note is shared with you for viewing only.',
    ),
  labelLimitReached: () =>
    new AppError(
      400,
      'label_limit_reached',
      'Label limit reached',
      'You can create up to 50 labels.',
    ),
  tokenLimitReached: () =>
    new AppError(
      400,
      'token_limit_reached',
      'API token limit reached',
      'You can create up to 10 API tokens.',
    ),
  payloadTooLarge: (detail?: string) =>
    new AppError(413, 'payload_too_large', 'Payload Too Large', detail),
  unsupportedMediaType: (detail?: string) =>
    new AppError(415, 'unsupported_media_type', 'Unsupported Media Type', detail),
  internal: (detail?: string) =>
    new AppError(500, 'internal_error', 'Internal Server Error', detail),
};
