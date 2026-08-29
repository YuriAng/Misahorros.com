// GET /api/import/legacy/status, POST /api/import/legacy — one-time,
// idempotent import of the browser's `budgetpwa_data_v1` shape (design.md
// "Sequence: Legacy Data Import"). Idempotency comes from `ON CONFLICT DO
// NOTHING` per table on client-generated ids, all inside a single DB
// transaction; a malformed payload is rejected before the transaction opens
// so a rejected request writes nothing at all.
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { badRequest } from '../errors.js';
import { monthKeyFromDate } from '../services/months.js';

const router = Router();
const MONTH_KEY_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

// Structural validation of the `budgetpwa_data_v1` shape. Throws `400` on
// the first violation and performs no I/O, so a malformed payload never
// reaches the transaction (spec: "Malformed Source Rejected").
function validateLegacyPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('payload must be an object', 'body');
  }

  if (!Array.isArray(body.categories)) {
    throw badRequest('categories must be an array', 'categories');
  }
  for (const category of body.categories) {
    if (!category || typeof category !== 'object' || Array.isArray(category)) {
      throw badRequest('each category must be an object', 'categories');
    }
    if (typeof category.id !== 'string' || !category.id.trim()) {
      throw badRequest('each category requires a string id', 'categories');
    }
    if (typeof category.name !== 'string' || !category.name.trim()) {
      throw badRequest('each category requires a name', 'categories');
    }
  }

  if (!body.months || typeof body.months !== 'object' || Array.isArray(body.months)) {
    throw badRequest('months must be an object', 'months');
  }
  for (const [monthKey, month] of Object.entries(body.months)) {
    if (!MONTH_KEY_RE.test(monthKey)) {
      throw badRequest(`invalid month key: ${monthKey}`, 'months');
    }
    if (!month || typeof month !== 'object' || Array.isArray(month)) {
      throw badRequest(`month ${monthKey} must be an object`, 'months');
    }
    if (month.income !== undefined) {
      if (typeof month.income !== 'object' || month.income === null || Array.isArray(month.income)) {
        throw badRequest(`month ${monthKey}.income must be an object`, 'months');
      }
      if (month.income.amount !== undefined && Number.isNaN(Number(month.income.amount))) {
        throw badRequest(`month ${monthKey}.income.amount is invalid`, 'months');
      }
    }
    if (month.budgets !== undefined) {
      if (typeof month.budgets !== 'object' || month.budgets === null || Array.isArray(month.budgets)) {
        throw badRequest(`month ${monthKey}.budgets must be an object`, 'months');
      }
      for (const [categoryId, amount] of Object.entries(month.budgets)) {
        if (!categoryId || Number.isNaN(Number(amount))) {
          throw badRequest(`month ${monthKey}.budgets has an invalid entry`, 'months');
        }
      }
    }
    if (month.transactions !== undefined) {
      if (!Array.isArray(month.transactions)) {
        throw badRequest(`month ${monthKey}.transactions must be an array`, 'months');
      }
      for (const txn of month.transactions) {
        if (!txn || typeof txn !== 'object' || Array.isArray(txn)) {
          throw badRequest(`month ${monthKey} has an invalid transaction`, 'months');
        }
        if (typeof txn.id !== 'string' || !txn.id.trim()) {
          throw badRequest(`month ${monthKey} has a transaction with no string id`, 'months');
        }
        if (typeof txn.categoryId !== 'string' || !txn.categoryId.trim()) {
          throw badRequest(`transaction ${txn.id} requires a categoryId`, 'months');
        }
        if (txn.amount === undefined || txn.amount === null || Number.isNaN(Number(txn.amount))) {
          throw badRequest(`transaction ${txn.id} has an invalid amount`, 'months');
        }
        if (!txn.date || Number.isNaN(new Date(txn.date).getTime())) {
          throw badRequest(`transaction ${txn.id} has an invalid date`, 'months');
        }
      }
    }
  }

  if (body.settings !== undefined) {
    if (typeof body.settings !== 'object' || body.settings === null || Array.isArray(body.settings)) {
      throw badRequest('settings must be an object', 'settings');
    }
  }
}

router.get(
  '/legacy/status',
  asyncHandler(async (req, res) => {
    const row = await db('settings').where({ key: 'legacy_import_at' }).first();
    res.json({
      imported: Boolean(row && row.value),
      importedAt: row ? row.value : null,
    });
  })
);

router.post(
  '/legacy',
  asyncHandler(async (req, res) => {
    validateLegacyPayload(req.body);
    const payload = req.body;

    const result = await db.transaction(async (trx) => {
      const counts = {
        categories: { imported: 0, skipped: 0 },
        months: { imported: 0, skipped: 0 },
        budgets: { imported: 0, skipped: 0 },
        transactions: { imported: 0, skipped: 0 },
      };

      // 1) categories — ON CONFLICT (id) DO NOTHING
      for (const category of payload.categories) {
        const inserted = await trx('categories')
          .insert({
            id: category.id,
            name: String(category.name).trim(),
            icon: category.icon ? String(category.icon).trim() : '💸',
            color: category.color || '#4F8EF7',
            archived: Boolean(category.archived),
            created_at: category.createdAt ? new Date(category.createdAt) : trx.fn.now(),
          })
          .onConflict('id')
          .ignore()
          .returning('id');
        if (inserted.length) counts.categories.imported++;
        else counts.categories.skipped++;
      }

      // Every month key that must exist for FKs to hold: every top-level
      // legacy month key, PLUS the *derived* month key of every transaction
      // (Fix B applies to imported history too — a transaction's date, not
      // the bucket it was originally filed under, decides its month).
      const monthKeysNeeded = new Set(Object.keys(payload.months));
      for (const month of Object.values(payload.months)) {
        for (const txn of month.transactions || []) {
          monthKeysNeeded.add(monthKeyFromDate(new Date(txn.date)));
        }
      }

      // 2) months — ON CONFLICT (month_key) DO NOTHING
      for (const monthKey of monthKeysNeeded) {
        const month = payload.months[monthKey];
        const income = month?.income || {};
        const inserted = await trx('months')
          .insert({
            month_key: monthKey,
            income_amount: Number(income.amount) || 0,
            income_updated_at: income.updatedAt ? new Date(income.updatedAt) : null,
          })
          .onConflict('month_key')
          .ignore()
          .returning('month_key');
        if (inserted.length) counts.months.imported++;
        else counts.months.skipped++;
      }

      // 3) category_budgets — ON CONFLICT (month_key, category_id) DO NOTHING
      for (const [monthKey, month] of Object.entries(payload.months)) {
        for (const [categoryId, amount] of Object.entries(month.budgets || {})) {
          const inserted = await trx('category_budgets')
            .insert({ month_key: monthKey, category_id: categoryId, amount: Number(amount) || 0 })
            .onConflict(['month_key', 'category_id'])
            .ignore()
            .returning('category_id');
          if (inserted.length) counts.budgets.imported++;
          else counts.budgets.skipped++;
        }
      }

      // 4) transactions — ON CONFLICT (id) DO NOTHING; month_key recomputed
      // from the transaction's own `date`, never trusted from the legacy
      // bucket it was stored under (Bug Fix B).
      for (const month of Object.values(payload.months)) {
        for (const txn of month.transactions || []) {
          const txnDate = new Date(txn.date);
          const derivedMonthKey = monthKeyFromDate(txnDate);
          const inserted = await trx('transactions')
            .insert({
              id: txn.id,
              month_key: derivedMonthKey,
              category_id: txn.categoryId,
              amount: Number(txn.amount),
              note: txn.note ? String(txn.note).trim() : '',
              date: txnDate,
            })
            .onConflict('id')
            .ignore()
            .returning('id');
          if (inserted.length) counts.transactions.imported++;
          else counts.transactions.skipped++;
        }
      }

      // 5) upsert settings.legacy_import_at — server-side "already imported"
      // marker, so it survives a browser change (design.md).
      const importedAt = new Date().toISOString();
      await trx('settings')
        .insert({ key: 'legacy_import_at', value: importedAt })
        .onConflict('key')
        .merge();

      return { counts, importedAt };
    });

    res.json({
      imported: {
        categories: result.counts.categories.imported,
        months: result.counts.months.imported,
        budgets: result.counts.budgets.imported,
        transactions: result.counts.transactions.imported,
      },
      skipped: {
        categories: result.counts.categories.skipped,
        months: result.counts.months.skipped,
        budgets: result.counts.budgets.skipped,
        transactions: result.counts.transactions.skipped,
      },
      importedAt: result.importedAt,
    });
  })
);

export default router;
