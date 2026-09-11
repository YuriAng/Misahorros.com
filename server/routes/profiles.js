// GET/POST/PATCH/DELETE /api/profiles (design.md "API Contract Changes",
// budget-api spec "Profile Management Endpoints"). `PUT /api/profiles/active`
// is added in Phase 4 alongside bootstrap/settings integration.
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { generateId } from '../utils.js';
import { archiveProfile, serializeProfile } from '../services/profiles.js';
import { buildBootstrapPayload } from '../services/bootstrap.js';

const router = Router();

// Case-insensitive, btrim-insensitive duplicate check among LIVE profiles
// only — mirrors the DB's own `budget_profiles_live_name_unique` partial
// index (design.md "Target Schema"), so an archived name never blocks a
// new profile with the same name.
async function findDuplicateLiveName(executor, name, excludeId) {
  let query = executor('budget_profiles')
    .where({ archived: false })
    .whereRaw('lower(btrim(name)) = lower(btrim(?))', [name]);
  if (excludeId) query = query.whereNot({ id: excludeId });
  return query.first();
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.includeArchived === '1';
    let query = db('budget_profiles');
    if (!includeArchived) query = query.where({ archived: false });
    const rows = await query.orderBy([
      { column: 'archived', order: 'asc' },
      { column: 'created_at', order: 'asc' },
    ]);
    res.json(rows.map(serializeProfile));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, name } = req.body || {};
    if (!name || !String(name).trim()) {
      throw badRequest('name is required', 'name');
    }
    const trimmedName = String(name).trim();
    const profileId = id || generateId('prof');

    const duplicate = await findDuplicateLiveName(db, trimmedName);
    if (duplicate) {
      throw conflict(`A live profile named "${trimmedName}" already exists`, 'duplicate_name');
    }

    const [row] = await db('budget_profiles').insert({ id: profileId, name: trimmedName }).returning('*');
    res.status(201).json(serializeProfile(row));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body || {};

    const existing = await db('budget_profiles').where({ id }).first();
    if (!existing) throw notFound(`Profile ${id} not found`);

    if (name === undefined) {
      return res.json(serializeProfile(existing));
    }

    if (!String(name).trim()) throw badRequest('name cannot be blank', 'name');
    const trimmedName = String(name).trim();

    const duplicate = await findDuplicateLiveName(db, trimmedName, id);
    if (duplicate) {
      throw conflict(`A live profile named "${trimmedName}" already exists`, 'duplicate_name');
    }

    const [updated] = await db('budget_profiles').where({ id }).update({ name: trimmedName }).returning('*');
    res.json(serializeProfile(updated));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await archiveProfile(req.params.id);
    res.status(204).end();
  })
);

// budget-api spec: "Profile Management Endpoints" — the write (UPSERT
// settings.active_profile) and the read (the new bootstrap payload) happen
// in one transaction, so the response can never describe a profile other
// than the one just activated (design.md "Sequence: Switching Profile").
router.put(
  '/active',
  asyncHandler(async (req, res) => {
    const { profileId } = req.body || {};
    if (!profileId || typeof profileId !== 'string') {
      throw badRequest('profileId is required', 'profileId');
    }

    const payload = await db.transaction(async (trx) => {
      const profile = await trx('budget_profiles').where({ id: profileId }).first();
      if (!profile) throw notFound(`Profile ${profileId} not found`);
      if (profile.archived) {
        throw conflict('Cannot switch to an archived profile.', 'profile_archived');
      }

      await trx('settings').insert({ key: 'active_profile', value: profileId }).onConflict('key').merge();

      return buildBootstrapPayload(trx, { profileId });
    });

    res.json(payload);
  })
);

export default router;
