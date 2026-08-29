// Structured API errors. Every route throws one of these (or lets a
// Postgres constraint violation bubble up) and the centralized error
// middleware in server/index.js turns it into the shared
// `{ error: { code, message, field? } }` shape (design.md REST API Contract).

export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export function badRequest(message, field) {
  return new ApiError(400, 'bad_request', message, field);
}

export function notFound(message) {
  return new ApiError(404, 'not_found', message);
}

export function conflict(message) {
  return new ApiError(409, 'conflict', message);
}
