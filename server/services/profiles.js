// Profile resolution + invariants (design.md "Enforcement at the router
// mount point, not inside handlers", "Deletion is archival, and at least
// one unarchived profile must always exist").
import db from '../db.js';
import { conflict, internalError, notFound } from '../errors.js';

/**
 * Resolves the active profile from `settings.active_profile` and sets
 * `req.profileId` — the single enforcement point for every scoped route
 * (budget-profiles spec, "Server-Resolved Active Profile"). No endpoint
 * ever accepts a client-supplied `profileId` for scoping.
 *
 * `active_profile` is set by migration 002 within the same transaction
 * that creates the default profile, so it is always present for any
 * request served after that migration — an unset value here means the
 * migration has not run, which is a deployment error, not a request error.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
/**
 * Serializes a `budget_profiles` row into the response shape shared by
 * `server/routes/profiles.js` (list/create/rename) and
 * `server/services/bootstrap.js` (the `profiles` array in every
 * bootstrap-shaped payload) — one shape, one place to keep it correct.
 *
 * @param {object} row
 */
export function serializeProfile(row) {
  return {
    id: row.id,
    name: row.name,
    archived: row.archived,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function requireActiveProfile(req, res, next) {
  try {
    const row = await db('settings').where({ key: 'active_profile' }).first();
    if (!row || !row.value) {
      throw internalError('settings.active_profile is not set — has migration 002 run?');
    }
    req.profileId = row.value;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Archives profile `id` inside one transaction, enforcing both invariants
 * (design.md "Decision: Deletion is archival, and at least one unarchived
 * profile must always exist"):
 *   1. `409 last_profile` — the last unarchived profile cannot be archived.
 *      Checked first: if only one live profile exists, it is necessarily
 *      the active one too, and the more fundamental invariant reports.
 *   2. `409 profile_is_active` — the currently active profile cannot be
 *      archived while 2+ live profiles exist; switch first.
 *
 * `forUpdate()` on the live set is what makes "at least one" hold under
 * two concurrent archive requests.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function archiveProfile(id) {
  await db.transaction(async (trx) => {
    const target = await trx('budget_profiles').where({ id }).first();
    if (!target) throw notFound(`Profile ${id} not found`);

    if (!target.archived) {
      const live = await trx('budget_profiles').where({ archived: false }).forUpdate();
      if (live.length <= 1) {
        throw conflict('At least one budget profile must remain unarchived.', 'last_profile');
      }
    }

    const active = await trx('settings').where({ key: 'active_profile' }).first();
    if (active?.value === id) {
      throw conflict('Cannot archive the active profile. Switch to a different profile first.', 'profile_is_active');
    }

    await trx('budget_profiles').where({ id }).update({ archived: true });
  });
}
