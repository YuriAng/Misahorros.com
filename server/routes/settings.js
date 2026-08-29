// GET/PUT /api/settings — key/value settings table (design.md DDL:
// 'currency' | 'active_month' | 'legacy_import_at'). PUT never touches the
// `months` table, so it can never materialize a month.
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';

const router = Router();

async function readSettings(executor = db) {
  const rows = await executor('settings').whereIn('key', ['currency', 'active_month']);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    currency: map.currency || 'USD',
    activeMonth: map.active_month || null,
  };
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
    const { currency, activeMonth } = req.body || {};
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
