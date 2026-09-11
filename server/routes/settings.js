// GET/PUT /api/settings — key/value settings table (design.md DDL:
// 'currency' | 'active_month' | 'active_profile' | 'legacy_import_at'). PUT
// never touches the `months` table, so it can never materialize a month.
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { badRequest } from '../errors.js';
import { SETTINGS_KEYS, mapSettingsRows } from '../services/settings.js';

const router = Router();

async function readSettings(executor = db) {
  const rows = await executor('settings').whereIn('key', SETTINGS_KEYS);
  return mapSettingsRows(rows);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await readSettings());
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { currency, activeMonth, activeProfile } = req.body || {};

    // Switching the active profile is never a plain settings write — it
    // needs FK validation and a full-payload response, so it gets its own
    // endpoint (budget-api spec: "PUT /api/settings rejects an active
    // profile field"; design.md "One write path, one place to get it
    // right"). Reject the whole request rather than silently dropping the
    // field, so a caller cannot mistake a partial write for a full one.
    if (activeProfile !== undefined) {
      throw badRequest('activeProfile cannot be set via PUT /api/settings; use PUT /api/profiles/active', 'activeProfile');
    }

    const updates = [];
    if (currency !== undefined) {
      updates.push({ key: 'currency', value: String(currency) });
    }
    if (activeMonth !== undefined) {
      updates.push({ key: 'active_month', value: activeMonth === null ? null : String(activeMonth) });
    }

    if (updates.length) {
      await db.transaction(async (trx) => {
        for (const row of updates) {
          await trx('settings').insert(row).onConflict('key').merge();
        }
      });
    }

    res.json(await readSettings());
  })
);

export default router;
