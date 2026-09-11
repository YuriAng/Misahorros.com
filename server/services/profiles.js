// Profile resolution + invariants (design.md "Enforcement at the router
// mount point, not inside handlers", "Deletion is archival, and at least
// one unarchived profile must always exist").
//
// Phase 1 stub: `requireActiveProfile` is a no-op pass-through so later
// phases have a stable import to build on. Phase 2 (task 2.3) replaces the
// body with real `settings.active_profile` resolution into `req.profileId`,
// throwing a 500 if unset (should never happen once migration 002 has run —
// see budget-profiles spec, "Server-Resolved Active Profile").

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function requireActiveProfile(req, res, next) {
  next();
}
