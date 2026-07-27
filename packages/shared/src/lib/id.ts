import { v7 as uuidv7 } from 'uuid';

/**
 * UUIDv7 ids: time-ordered, index-friendly, and generatable on the client so a
 * freshly composed note has a stable `?note=` URL before the server confirms.
 */
export function newId(): string {
  return uuidv7();
}
