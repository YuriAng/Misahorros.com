// Single home for month derivation and materialization (design.md
// "months row is required, but only writes create it" and "month_key
// computed server-side from date in a configured timezone"). Every query
// here is scoped by `profileId` (design.md "Query Rewrites" —
// getMonthPayload()"): the server never trusts a client-supplied profile.
import db from '../db.js';

const DEFAULT_TZ = 'America/Caracas';

/**
 * Computes the `YYYY-MM` bucket a date falls into, in the given IANA
 * timezone. Clients never supply `month_key` directly — it is always
 * derived here, from the record's own `date` (Bug Fix B).
 *
 * @param {Date|string|number} date
 * @param {string} [tz] defaults to `APP_TZ` env var, then `America/Caracas`
 * @returns {string} e.g. "2026-05"
 */
export function monthKeyFromDate(date, tz = process.env.APP_TZ || DEFAULT_TZ) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  return `${year}-${month}`;
}

/**
 * Ensures a `months` row exists for `(profileId, monthKey)`, creating it
 * only if missing. MUST be called with the same transaction as the write
 * that needs it — never from a GET path (design.md: "reads never create
 * it").
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {string} profileId
 * @param {string} monthKey
 * @returns {Promise<object>} the (existing or newly created) months row
 */
export async function materializeMonth(trx, profileId, monthKey) {
  await trx('months')
    .insert({ profile_id: profileId, month_key: monthKey })
    .onConflict(['profile_id', 'month_key'])
    .ignore();
  return trx('months').where({ profile_id: profileId, month_key: monthKey }).first();
}

/**
 * Reads the full month payload (design.md REST API Contract "Month
 * payload") WITHOUT ever creating a `months` row — this is Bug Fix A.
 * Balances are always the query-time aggregate, never a stored column.
 * Every query is scoped to `profileId`; the two `b.profile_id = c.profile_id`
 * / `t.profile_id = c.profile_id` join predicates are defense-in-depth —
 * logically redundant given the composite FKs, but free, and they keep the
 * aggregate leak-proof even if a future migration relaxes a constraint.
 *
 * @param {string} profileId
 * @param {string} monthKey
 * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor] defaults to the shared db instance
 */
export async function getMonthPayload(profileId, monthKey, executor = db) {
  const monthRow = await executor('months').where({ profile_id: profileId, month_key: monthKey }).first();
  const materialized = Boolean(monthRow);

  const budgetRows = await executor('category_budgets').where({ profile_id: profileId, month_key: monthKey });
  const budgets = {};
  for (const row of budgetRows) {
    budgets[row.category_id] = Number(row.amount);
  }

  const transactionRows = await executor('transactions')
    .where({ profile_id: profileId, month_key: monthKey })
    .orderBy([
      { column: 'date', order: 'desc' },
      { column: 'id', order: 'desc' },
    ]);
  const transactions = transactionRows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    amount: Number(row.amount),
    note: row.note,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
  }));

  // Per-category derivation — the exact aggregate from design.md's
  // "Query Rewrites" section, so no balance is ever persisted.
  const { rows: categoryRows } = await executor.raw(
    `SELECT c.id,
            COALESCE(b.amount, 0)                               AS budget,
            COALESCE(SUM(t.amount), 0)                          AS spent,
            COALESCE(b.amount, 0) - COALESCE(SUM(t.amount), 0)  AS remaining
     FROM categories c
     LEFT JOIN category_budgets b
            ON b.category_id = c.id
           AND b.profile_id  = c.profile_id
           AND b.month_key   = ?
     LEFT JOIN transactions t
            ON t.category_id = c.id
           AND t.profile_id  = c.profile_id
           AND t.month_key   = ?
     WHERE c.profile_id = ?
     GROUP BY c.id, b.amount`,
    [monthKey, monthKey, profileId]
  );

  const categoryTotals = {};
  let totalBudgeted = 0;
  let totalSpent = 0;
  for (const row of categoryRows) {
    const budget = Number(row.budget);
    const spent = Number(row.spent);
    const remaining = Number(row.remaining);
    categoryTotals[row.id] = { budget, spent, remaining };
    totalBudgeted += budget;
    totalSpent += spent;
  }

  const income = {
    amount: monthRow ? Number(monthRow.income_amount) : 0,
    updatedAt:
      monthRow && monthRow.income_updated_at
        ? monthRow.income_updated_at instanceof Date
          ? monthRow.income_updated_at.toISOString()
          : monthRow.income_updated_at
        : null,
  };

  // Ordering note: `profile_id` leads the `months` primary key precisely so
  // this predicate + range scan uses the index directly (design.md
  // "Ordering note (profile_id first)").
  const previousMonth = await executor('months')
    .where({ profile_id: profileId })
    .andWhere('month_key', '<', monthKey)
    .orderBy('month_key', 'desc')
    .first();

  return {
    monthKey,
    materialized,
    income,
    budgets,
    transactions,
    totals: {
      income: income.amount,
      totalBudgeted,
      totalSpent,
      totalAvailable: income.amount - totalSpent,
    },
    categoryTotals,
    carryForward: {
      available: !materialized && Boolean(previousMonth),
      sourceMonth: previousMonth ? previousMonth.month_key : null,
    },
  };
}
