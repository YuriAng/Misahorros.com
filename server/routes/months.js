// GET /api/months/{k} (side-effect free — Bug Fix A), PUT income, PUT
// budgets/{catId} (both materialize the month), POST carry-forward (409 if
// the month is already materialized).
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { badRequest, conflict } from '../errors.js';
import { getMonthPayload, materializeMonth } from '../services/months.js';

const router = Router();
const MONTH_KEY_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

function assertMonthKey(monthKey) {
  if (!MONTH_KEY_RE.test(monthKey)) {
    throw badRequest(`Invalid month key: ${monthKey}`, 'monthKey');
  }
}

function assertAmount(amount) {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    throw badRequest('amount is required', 'amount');
  }
}

router.get(
  '/:monthKey',
  asyncHandler(async (req, res) => {
    const { monthKey } = req.params;
    assertMonthKey(monthKey);
    res.json(await getMonthPayload(monthKey));
  })
);

router.put(
  '/:monthKey/income',
  asyncHandler(async (req, res) => {
    const { monthKey } = req.params;
    assertMonthKey(monthKey);
    const { amount } = req.body || {};
    assertAmount(amount);

    const row = await db.transaction(async (trx) => {
      await materializeMonth(trx, monthKey);
      const [updated] = await trx('months')
        .where({ month_key: monthKey })
        .update({ income_amount: Number(amount), income_updated_at: trx.fn.now() })
        .returning('*');
      return updated;
    });

    res.json({
      amount: Number(row.income_amount),
      updatedAt: row.income_updated_at instanceof Date ? row.income_updated_at.toISOString() : row.income_updated_at,
    });
  })
);

router.put(
  '/:monthKey/budgets/:categoryId',
  asyncHandler(async (req, res) => {
    const { monthKey, categoryId } = req.params;
    assertMonthKey(monthKey);
    const { amount } = req.body || {};
    assertAmount(amount);

    await db.transaction(async (trx) => {
      const category = await trx('categories').where({ id: categoryId }).first();
      if (!category) throw badRequest(`Unknown category: ${categoryId}`, 'categoryId');

      await materializeMonth(trx, monthKey);
      await trx('category_budgets')
        .insert({ month_key: monthKey, category_id: categoryId, amount: Number(amount) })
        .onConflict(['month_key', 'category_id'])
        .merge();
    });

    res.json({ categoryId, amount: Number(amount) });
  })
);

router.post(
  '/:monthKey/carry-forward',
  asyncHandler(async (req, res) => {
    const { monthKey } = req.params;
    assertMonthKey(monthKey);

    const result = await db.transaction(async (trx) => {
      const existing = await trx('months').where({ month_key: monthKey }).first();
      if (existing) {
        throw conflict(`Month ${monthKey} is already materialized`);
      }

      const previous = await trx('months')
        .where('month_key', '<', monthKey)
        .orderBy('month_key', 'desc')
        .first();

      await materializeMonth(trx, monthKey);

      if (!previous) {
        return { copiedFrom: null, income: 0, budgetCount: 0 };
      }

      await trx('months')
        .where({ month_key: monthKey })
        .update({ income_amount: previous.income_amount, income_updated_at: trx.fn.now() });

      const previousBudgets = await trx('category_budgets').where({ month_key: previous.month_key });
      for (const budget of previousBudgets) {
        await trx('category_budgets').insert({
          month_key: monthKey,
          category_id: budget.category_id,
          amount: budget.amount,
        });
      }

      return {
        copiedFrom: previous.month_key,
        income: Number(previous.income_amount),
        budgetCount: previousBudgets.length,
      };
    });

    res.json(result);
  })
);

export default router;
