// `/api` router: mounts every resource router plus the two cross-cutting
// endpoints (health for the Docker healthcheck, bootstrap to fill the
// client cache in one call — design.md REST API Contract).
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { requireActiveProfile } from '../services/profiles.js';
import { buildBootstrapPayload } from '../services/bootstrap.js';
import settingsRouter from './settings.js';
import profilesRouter from './profiles.js';
import categoriesRouter from './categories.js';
import monthsRouter from './months.js';
import transactionsRouter from './transactions.js';
import importRouter from './import.js';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    await db.raw('select 1');
    res.json({ status: 'ok', db: 'ok' });
  })
);

router.get(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    // design.md "Changed shapes": + profiles array, + settings.activeProfile.
    // buildBootstrapPayload() is the single shared builder also used by
    // PUT /api/profiles/active, so both endpoints stay byte-identical in
    // shape by construction.
    res.json(await buildBootstrapPayload(db, { monthKey: req.query.month }));
  })
);

router.use('/settings', settingsRouter);
// Unscoped like /settings: profiles themselves are managed here, so this
// router cannot depend on requireActiveProfile resolving one first
// (design.md "Enforcement at the router mount point").
router.use('/profiles', profilesRouter);
// /import is mounted with requireActiveProfile too (task 4.8) even though
// server/routes/import.js never reads req.profileId — it targets
// `prof_default` unconditionally, never the active profile (design.md
// "Legacy import lands in the wrong profile" risk). Mounting it here keeps
// the enforcement point uniform across every write-capable router; import.js
// simply does not use the value it resolves.
router.use('/categories', requireActiveProfile, categoriesRouter);
router.use('/months', requireActiveProfile, monthsRouter);
router.use('/transactions', requireActiveProfile, transactionsRouter);
router.use('/import', requireActiveProfile, importRouter);

export default router;
