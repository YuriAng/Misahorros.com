// `/api` router: mounts every resource router plus the two cross-cutting
// endpoints (health for the Docker healthcheck, bootstrap to fill the
// client cache in one call — design.md REST API Contract).
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { getMonthPayload } from '../services/months.js';
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
    const [settingsRows, categoryRows] = await Promise.all([
      db('settings').whereIn('key', ['currency', 'active_month']),
      db('categories').orderBy('created_at', 'asc'),
    ]);

    const settingsMap = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));
    const settings = {
      currency: settingsMap.currency || 'USD',
      activeMonth: settingsMap.active_month || null,
    };

    const monthKey = req.query.month || settings.activeMonth;
    const month = monthKey ? await getMonthPayload(monthKey) : null;

    res.json({
      settings,
      categories: categoryRows.map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        color: row.color,
        archived: row.archived,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      })),
      month,
    });
  })
);

router.use('/settings', settingsRouter);
// Unscoped like /settings: profiles themselves are managed here, so this
// router cannot depend on requireActiveProfile resolving one first
// (design.md "Enforcement at the router mount point"). requireActiveProfile
// is mounted before the four scoped routers below in Phase 4, once
// settings/bootstrap/import are also profile-aware.
router.use('/profiles', profilesRouter);
router.use('/categories', categoriesRouter);
router.use('/months', monthsRouter);
router.use('/transactions', transactionsRouter);
router.use('/import', importRouter);

export default router;
