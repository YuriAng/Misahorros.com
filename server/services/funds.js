// Fund balance aggregation + the archive guard (design.md "Query Rewrites:
// server/services/funds.js", "Decision: archiving a fund with a nonzero
// balance is refused with 409 fund_has_balance"). A fund's balance is
// SUM(deposits) - SUM(withdrawals) computed at read time — never a stored
// column (savings-funds spec, "Derived Fund Balance"). Shared by
// server/routes/funds.js and server/services/bootstrap.js so both call
// sites stay in shape by construction.
import db from '../db.js';
import { conflict, notFound } from '../errors.js';

export function serializeFund(row) {
  return {
    id: row.id,
    name: row.name,
    archived: row.archived,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    balance: Number(row.balance),
  };
}

export function serializeFundMovement(row) {
  return {
    id: row.id,
    fundId: row.fund_id,
    type: row.type,
    amount: Number(row.amount),
    note: row.note,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
    monthKey: row.month_key,
  };
}

/**
 * Lists a profile's funds with their derived balance (design.md "Query
 * Rewrites"). LEFT JOIN so a fund with zero movements still yields a row
 * (balance 0). The `m.profile_id = f.profile_id` join predicate is
 * defense-in-depth — logically redundant given the composite FK, free on
 * the same index, and leak-proof even if a future migration relaxes it.
 *
 * @param {import('knex').Knex|import('knex').Knex.Transaction} executor
 * @param {string} profileId
 * @param {{ includeArchived?: boolean }} [options]
 */
export async function listFundsWithBalance(executor, profileId, { includeArchived = false } = {}) {
  const { rows } = await executor.raw(
    `SELECT f.id, f.name, f.archived, f.created_at,
            COALESCE(SUM(CASE WHEN m.type = 'deposit'    THEN m.amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN m.type = 'withdrawal' THEN m.amount ELSE 0 END), 0) AS balance
     FROM funds f
     LEFT JOIN fund_movements m
            ON m.fund_id    = f.id
           AND m.profile_id = f.profile_id
     WHERE f.profile_id = ?
       AND (? OR f.archived = FALSE)
     GROUP BY f.id, f.name, f.archived, f.created_at
     ORDER BY f.created_at ASC`,
    [profileId, includeArchived]
  );
  return rows.map(serializeFund);
}

/**
 * Single-fund balance for the archive and insufficient-funds guards. MUST
 * be called with the same transaction/executor that already holds
 * `forUpdate()` on the `funds` row, so the read is locked-safe.
 *
 * @param {import('knex').Knex|import('knex').Knex.Transaction} executor
 * @param {string} profileId
 * @param {string} fundId
 * @returns {Promise<number>}
 */
export async function computeFundBalance(executor, profileId, fundId) {
  const { rows } = await executor.raw(
    `SELECT COALESCE(SUM(CASE WHEN type = 'deposit'    THEN amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END), 0) AS balance
     FROM fund_movements WHERE profile_id = ? AND fund_id = ?`,
    [profileId, fundId]
  );
  return Number(rows[0].balance);
}

/**
 * Archives fund `id` inside one transaction, modeled on
 * `archiveProfile` (server/services/profiles.js). `forUpdate()` on the fund
 * row is what serializes this check against a concurrent movement insert,
 * which takes the SAME row lock — a SUM cannot be locked, the fund row it
 * sums over can (design.md "Decision: archiving a fund with a nonzero
 * balance is refused with 409 fund_has_balance").
 *
 * @param {string} profileId
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function archiveFund(profileId, id) {
  await db.transaction(async (trx) => {
    const fund = await trx('funds').where({ id, profile_id: profileId }).forUpdate().first();
    if (!fund) throw notFound(`Fund ${id} not found`);

    const balance = await computeFundBalance(trx, profileId, id);
    if (balance !== 0) {
      throw conflict(
        `Este fondo todavía tiene saldo (${balance}). Retira el saldo completo antes de archivarlo.`,
        'fund_has_balance'
      );
    }
    await trx('funds').where({ id, profile_id: profileId }).update({ archived: true });
  });
}
