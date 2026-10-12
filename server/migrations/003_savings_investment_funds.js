/**
 * Adds two new tables — `funds` (identity only) and `fund_movements` (an
 * append-only ledger) — for savings and investment funds (design.md "Target
 * Schema (resulting DDL)").
 *
 * A fund's balance is SUM(deposits) - SUM(withdrawals) at read time and is
 * never stored, so the Derived-Balance Invariant
 * (specs/budget-persistence) holds by construction: neither table has a
 * `balance`, `fund_balance`, `total_deposited`, or `total_withdrawn`
 * column.
 *
 * Unlike `002`, this migration adds no column to any existing table and
 * backfills nothing — so it needs no row-count assertions, no
 * nullable-then-NOT-NULL dance, and no `settings` seed. Knex's default
 * per-migration transaction plus Postgres transactional DDL still make it
 * atomic; this migration MUST NOT set `disableTransactions` and MUST NOT
 * open a nested transaction.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // 1 — identity table first (fund_movements references it)
  await knex.schema.createTable('funds', (t) => {
    t.text('id').primary();
    t.text('profile_id').notNullable().references('id').inTable('budget_profiles').onDelete('RESTRICT');
    t.text('name').notNullable();
    t.check('length(btrim(name)) > 0', [], 'funds_name_not_blank');
    t.boolean('archived').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['profile_id', 'id'], { indexName: 'funds_profile_id_unique' }); // composite FK target
    t.index(['profile_id', 'created_at'], 'funds_profile_idx');
  });
  // Case-insensitive name uniqueness among LIVE funds of the SAME profile, so
  // an archived "Fondo de ahorro" does not block a new one, and two profiles
  // may each have a fund of the same name. Mirrors
  // budget_profiles_live_name_unique (002_budget_profiles.js:55-58).
  await knex.raw(
    `CREATE UNIQUE INDEX funds_live_name_unique
       ON funds (profile_id, lower(btrim(name))) WHERE archived = FALSE`
  );

  // 2 — the ledger. month_key is derived server-side from `date`, never
  // supplied by the client (Bug Fix B).
  await knex.schema.createTable('fund_movements', (t) => {
    t.text('id').primary();
    t.text('profile_id').notNullable();
    t.text('fund_id').notNullable();
    t.text('month_key').notNullable();
    t.text('type').notNullable();
    t.check("type IN ('deposit', 'withdrawal')", [], 'fund_movements_type_valid');
    t.decimal('amount', 14, 2).notNullable();
    t.check('amount > 0', [], 'fund_movements_amount_positive');
    t.text('note').notNullable().defaultTo('');
    t.timestamp('date', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.foreign(['profile_id', 'fund_id']).references(['profile_id', 'id']).inTable('funds').onDelete('RESTRICT');
    t.foreign(['profile_id', 'month_key']).references(['profile_id', 'month_key']).inTable('months').onDelete('RESTRICT');
    t.index(['profile_id', 'month_key'], 'fund_movements_profile_month_idx');
    t.index(['profile_id', 'fund_id', 'date'], 'fund_movements_fund_idx');
  });
}

/**
 * A fund movement is the ONLY record that money entered or left a fund.
 * Nothing else in the schema witnesses it: there is no carry-forward copy
 * and no mirror in `transactions`. Dropping the ledger is unrecoverable, so
 * down() refuses rather than destroying it silently — the same stance 002
 * took against silently merging isolated budgets. The pre-migration
 * pg_dump is the recovery path past that point (proposal.md "Rollback Plan").
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const [{ count }] = await knex('fund_movements').count({ count: '*' });
  if (Number(count) > 0) {
    throw new Error(
      `003 down(): ${count} fund movements exist. Rolling back would destroy the only ` +
        `record of money held in or withdrawn from a fund. Restore the pre-migration pg_dump instead.`
    );
  }
  await knex.schema.dropTable('fund_movements'); // reverse creation order
  await knex.schema.dropTable('funds'); // its indexes drop with it
}
