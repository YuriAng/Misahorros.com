// POST/PUT/DELETE /api/transactions. `month_key` is ALWAYS computed
// server-side from the transaction's own `date` via `monthKeyFromDate` —
// never trusted from the client or any "active month" concept (Bug Fix B).
// Every handler is scoped to `req.profileId`, resolved upstream by
// `requireActiveProfile`.
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { badRequest, notFound } from '../errors.js';
import { generateId } from '../utils.js';
import { materializeMonth, monthKeyFromDate } from '../services/months.js';

const router = Router();

function serializeTransaction(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    amount: Number(row.amount),
    note: row.note,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
    monthKey: row.month_key,
  };
}

function parseDate(date) {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) {
    throw badRequest('date is invalid', 'date');
  }
  return d;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, categoryId, amount, note, date } = req.body || {};

    if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
      throw badRequest('amount is required', 'amount');
    }
    if (Number(amount) < 0) {
      throw badRequest('amount must not be negative', 'amount');
    }
    if (!categoryId) {
      throw badRequest('categoryId is required', 'categoryId');
    }

    const txnDate = parseDate(date);
    const monthKey = monthKeyFromDate(txnDate);
    const txnId = id || generateId('txn');

    const row = await db.transaction(async (trx) => {
      // Scoped lookup: a categoryId belonging to another profile is
      // indistinguishable from an unknown one (budget-api spec,
      // "Referencing a category from another profile").
      const category = await trx('categories').where({ id: categoryId, profile_id: req.profileId }).first();
      if (!category) throw badRequest(`Unknown category: ${categoryId}`, 'categoryId');

      await materializeMonth(trx, req.profileId, monthKey);

      const [inserted] = await trx('transactions')
        .insert({
          id: txnId,
          profile_id: req.profileId,
          month_key: monthKey,
          category_id: categoryId,
          amount: Number(amount),
          note: note ? String(note).trim() : '',
          date: txnDate,
        })
        .returning('*');

      return inserted;
    });

    res.status(201).json(serializeTransaction(row));
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { categoryId, amount, note, date } = req.body || {};

    // Scoped so a foreign id — one that exists but belongs to another
    // profile — returns 404, not a mutation across profiles (design.md
    // "Cross-profile write paths that composite FKs do not close").
    const existing = await db('transactions').where({ id, profile_id: req.profileId }).first();
    if (!existing) throw notFound(`Transaction ${id} not found`);

    if (amount !== undefined) {
      if (amount === null || Number.isNaN(Number(amount))) throw badRequest('amount is invalid', 'amount');
      if (Number(amount) < 0) throw badRequest('amount must not be negative', 'amount');
    }

    const updates = {};
    if (amount !== undefined) updates.amount = Number(amount);
    if (note !== undefined) updates.note = String(note).trim();
    if (date !== undefined) {
      const txnDate = parseDate(date);
      updates.date = txnDate;
      updates.month_key = monthKeyFromDate(txnDate);
    }

    const row = await db.transaction(async (trx) => {
      if (categoryId !== undefined) {
        const category = await trx('categories').where({ id: categoryId, profile_id: req.profileId }).first();
        if (!category) throw badRequest(`Unknown category: ${categoryId}`, 'categoryId');
        updates.category_id = categoryId;
      }

      if (updates.month_key) {
        await materializeMonth(trx, req.profileId, updates.month_key);
      }

      const [updated] = await trx('transactions').where({ id, profile_id: req.profileId }).update(updates).returning('*');
      return updated;
    });

    res.json(serializeTransaction(row));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deleted = await db('transactions').where({ id, profile_id: req.profileId }).delete();
    if (!deleted) throw notFound(`Transaction ${id} not found`);
    res.status(204).end();
  })
);

export default router;
