/**
 * Introduces `budget_profiles` and scopes every existing domain table to a
 * profile via a `profile_id` column (design.md "Migration
 * server/migrations/002_budget_profiles.js").
 *
 * Knex wraps each migration in a transaction by default and Postgres has
 * transactional DDL, so this entire sequence is atomic: any failure —
 * including the row-count/NULL assertions below — rolls back to the `001`
 * shape with zero partial state. This migration MUST NOT disable that
 * transaction and MUST NOT open a nested one.
 *
 * Zero-data-loss strategy (proposal.md "Risks", design.md "Migration"):
 *   1. Create the table and insert exactly one profile ("General" /
 *      `prof_default`) — the only profile that exists at this point.
 *   2. Add `profile_id` as NULLABLE everywhere (NOT NULL would fail on any
 *      non-empty table).
 *   3. Backfill every existing row to that profile's id.
 *   4. Assert row counts are unchanged and zero NULLs remain — BEFORE
 *      constraining anything. A failed assertion throws, and the whole
 *      transaction rolls back.
 *   5. Only then enforce NOT NULL and reshape the FK/PK graph so a
 *      cross-profile reference becomes structurally unrepresentable.
 */

const DEFAULT_PROFILE_ID = 'prof_default'; // deliberately literal, not generateId():
const DEFAULT_PROFILE_NAME = 'General'; // down() and tests must be able to name it.
const BACKFILLED_TABLES = ['categories', 'months', 'category_budgets', 'transactions'];

/**
 * @param { import("knex").Knex } knex
 * @returns {Promise<Record<string, number>>} row count per backfilled table
 */
async function counts(knex) {
  const result = {};
  for (const table of BACKFILLED_TABLES) {
    const [{ count }] = await knex(table).count({ count: '*' });
    result[table] = Number(count);
  }
  return result;
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  // 1 — profiles table + live-name uniqueness
  await knex.schema.createTable('budget_profiles', (t) => {
    t.text('id').primary();
    t.text('name').notNullable();
    t.check('length(btrim(name)) > 0', [], 'budget_profiles_name_not_blank');
    t.boolean('archived').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(
    `CREATE UNIQUE INDEX budget_profiles_live_name_unique
       ON budget_profiles (lower(btrim(name))) WHERE archived = FALSE`
  );

  // 2 — the default profile every existing row will belong to
  await knex('budget_profiles').insert({ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME });

  // 3 — count BEFORE (zero-data-loss assertion baseline)
  const before = await counts(knex);

  // 4 — add NULLABLE profile_id everywhere (NOT NULL here would fail on non-empty tables)
  for (const table of BACKFILLED_TABLES) {
    await knex.schema.alterTable(table, (t) => t.text('profile_id').nullable());
  }

  // 5 — backfill every existing row into the default profile
  for (const table of BACKFILLED_TABLES) {
    await knex(table).update({ profile_id: DEFAULT_PROFILE_ID });
  }

  // 6 — assert zero loss and zero orphans BEFORE constraining
  const after = await counts(knex);
  for (const table of Object.keys(before)) {
    if (before[table] !== after[table]) {
      throw new Error(`002: row count changed for ${table}: ${before[table]} -> ${after[table]}`);
    }
    const [{ count: nulls }] = await knex(table).whereNull('profile_id').count();
    if (Number(nulls) !== 0) {
      throw new Error(`002: ${nulls} rows in ${table} left unbackfilled`);
    }
  }

  // 7 — NOT NULL now that every row has a value
  for (const table of BACKFILLED_TABLES) {
    await knex.schema.alterTable(table, (t) => t.text('profile_id').notNullable().alter());
  }

  // 8 — DROP dependent single-column FKs FIRST. months_pkey cannot be dropped
  //     while any FK still references months(month_key) alone.
  await knex.schema.alterTable('category_budgets', (t) => {
    t.dropForeign(['month_key']); // category_budgets_month_key_foreign
    t.dropForeign(['category_id']); // category_budgets_category_id_foreign
    t.dropPrimary(); // category_budgets_pkey
  });
  await knex.schema.alterTable('transactions', (t) => {
    t.dropForeign(['month_key']);
    t.dropForeign(['category_id']);
    t.dropIndex('month_key', 'transactions_month_idx');
    t.dropIndex(['month_key', 'category_id'], 'transactions_month_cat_idx');
  });

  // 9 — reshape identities
  await knex.schema.alterTable('months', (t) => {
    t.dropPrimary(); // months_pkey
    t.primary(['profile_id', 'month_key']); // profile_id FIRST (index ordering)
    t.foreign('profile_id').references('id').inTable('budget_profiles').onDelete('RESTRICT');
  });
  await knex.schema.alterTable('categories', (t) => {
    t.unique(['profile_id', 'id'], { indexName: 'categories_profile_id_unique' });
    t.foreign('profile_id').references('id').inTable('budget_profiles').onDelete('RESTRICT');
    t.index(['profile_id', 'created_at'], 'categories_profile_idx');
  });

  // 10 — composite FKs: cross-profile references become unrepresentable
  await knex.schema.alterTable('category_budgets', (t) => {
    t.primary(['profile_id', 'month_key', 'category_id']);
    t.foreign(['profile_id', 'month_key']).references(['profile_id', 'month_key']).inTable('months').onDelete('RESTRICT');
    t.foreign(['profile_id', 'category_id']).references(['profile_id', 'id']).inTable('categories').onDelete('RESTRICT');
  });
  await knex.schema.alterTable('transactions', (t) => {
    t.foreign(['profile_id', 'month_key']).references(['profile_id', 'month_key']).inTable('months').onDelete('RESTRICT');
    t.foreign(['profile_id', 'category_id']).references(['profile_id', 'id']).inTable('categories').onDelete('RESTRICT');
    t.index(['profile_id', 'month_key'], 'transactions_profile_month_idx');
    t.index(['profile_id', 'month_key', 'category_id'], 'transactions_profile_month_cat_idx');
  });

  // 11 — the app has an active profile the instant it boots
  await knex('settings').insert({ key: 'active_profile', value: DEFAULT_PROFILE_ID }).onConflict('key').merge();
}

/**
 * Refuses rather than silently merging. A rollback after a SECOND profile
 * has been used would collapse two isolated budgets into one — exactly the
 * data loss this change forbids. The pg_dump taken before this migration
 * ran is the recovery path in that case (proposal.md "Rollback Plan").
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  for (const table of BACKFILLED_TABLES) {
    const [{ count }] = await knex(table).whereNot('profile_id', DEFAULT_PROFILE_ID).count();
    if (Number(count) > 0) {
      throw new Error(
        `002 down(): ${count} rows in ${table} belong to a non-default profile. ` +
          `Rolling back would merge isolated budgets. Restore the pre-migration pg_dump instead.`
      );
    }
  }

  // reverse of step 11
  await knex('settings').where({ key: 'active_profile' }).delete();

  // reverse of step 10 — composite FKs/indexes
  await knex.schema.alterTable('transactions', (t) => {
    t.dropIndex(['profile_id', 'month_key', 'category_id'], 'transactions_profile_month_cat_idx');
    t.dropIndex(['profile_id', 'month_key'], 'transactions_profile_month_idx');
    t.dropForeign(['profile_id', 'category_id']);
    t.dropForeign(['profile_id', 'month_key']);
  });
  await knex.schema.alterTable('category_budgets', (t) => {
    t.dropForeign(['profile_id', 'category_id']);
    t.dropForeign(['profile_id', 'month_key']);
    t.dropPrimary();
  });

  // reverse of step 9 — identity reshape
  await knex.schema.alterTable('categories', (t) => {
    t.dropIndex(['profile_id', 'created_at'], 'categories_profile_idx');
    t.dropForeign(['profile_id']);
    t.dropUnique(['profile_id', 'id'], 'categories_profile_id_unique');
  });
  await knex.schema.alterTable('months', (t) => {
    t.dropForeign(['profile_id']);
    t.dropPrimary();
    t.primary(['month_key']);
  });

  // reverse of step 8 — single-column FKs/indexes
  await knex.schema.alterTable('transactions', (t) => {
    t.index('month_key', 'transactions_month_idx');
    t.index(['month_key', 'category_id'], 'transactions_month_cat_idx');
    t.foreign('month_key').references('month_key').inTable('months').onDelete('RESTRICT');
    t.foreign('category_id').references('id').inTable('categories').onDelete('RESTRICT');
  });
  await knex.schema.alterTable('category_budgets', (t) => {
    t.primary(['month_key', 'category_id']);
    t.foreign('month_key').references('month_key').inTable('months').onDelete('RESTRICT');
    t.foreign('category_id').references('id').inTable('categories').onDelete('RESTRICT');
  });

  // reverse of steps 4-7 — drop profile_id everywhere
  for (const table of BACKFILLED_TABLES) {
    await knex.schema.alterTable(table, (t) => t.dropColumn('profile_id'));
  }

  // reverse of steps 1-2 — the unique index drops with the table
  await knex.schema.dropTable('budget_profiles');
}
