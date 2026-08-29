// Express 4 does not forward rejected promises from async route handlers to
// `next(err)` automatically. Wrapping every handler keeps routes free of
// repetitive try/catch while still funneling every error into the
// centralized error middleware.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
