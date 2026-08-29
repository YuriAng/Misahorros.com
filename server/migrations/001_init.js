/**
 * Initial schema for server-backed persistence (design.md "Postgres Schema (DDL)").
 *
 * Derived-balance invariant: no `spent`, `remaining`, `total_spent`,
 * `total_budgeted`, or `available` column exists anywhere in this schema.
 * Every balance is a query result computed at read time (see
 * server/services/months.js in a later phase).
 *
 * Creation order respects FK dependencies: categories/months first, then the
 * tables that reference them.
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  await knex.schema.createTable('categories', (table) => {
    table.text('id').primary();
    table.text('name').notNullable();
    table.check('length(btrim(name)) > 0', [], 'categories_name_not_blank');
    table.text('icon').notNullable().defaultTo('💸');
    table.text('color').notNullable().defaultTo('#4F8EF7');
    table.boolean('archived').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // One logical settings record, key/value so new keys need no migration.
  // Known keys: 'currency' | 'active_month' | 'legacy_import_at'
  await knex.schema.createTable('settings', (table) => {
    table.text('key').primary();
    table.text('value');
  });

  await knex.schema.createTable('months', (table) => {
    table.text('month_key').primary();
    table.check("month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'", [], 'months_month_key_format');
    table.decimal('income_amount', 14, 2).notNullable().defaultTo(0);
    table.timestamp('income_updated_at', { useTz: true });
  });

  await knex.schema.createTable('category_budgets', (table) => {
    table.text('month_key').notNullable().references('month_key').inTable('months').onDelete('RESTRICT');
    table.text('category_id').notNullable().references('id').inTable('categories').onDelete('RESTRICT');
    table.decimal('amount', 14, 2).notNullable().defaultTo(0);
    table.check('amount >= 0', [], 'category_budgets_amount_nonnegative');
    table.primary(['month_key', 'category_id']);
  });

  await knex.schema.createTable('transactions', (table) => {
    table.text('id').primary();
    table.text('month_key').notNullable().references('month_key').inTable('months').onDelete('RESTRICT');
    table.text('category_id').notNullable().references('id').inTable('categories').onDelete('RESTRICT');
    // Intentionally no `>= 0` CHECK: legacy import must stay lossless. The API
    // layer rejects negative amounts on new writes with 400 (design.md Notes).
    table.decimal('amount', 14, 2).notNullable();
    table.text('note').notNullable().defaultTo('');
    table.timestamp('date', { useTz: true }).notNullable();
    table.index('month_key', 'transactions_month_idx');
    table.index(['month_key', 'category_id'], 'transactions_month_cat_idx');
  });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('category_budgets');
  await knex.schema.dropTableIfExists('months');
  await knex.schema.dropTableIfExists('settings');
  await knex.schema.dropTableIfExists('categories');
}
