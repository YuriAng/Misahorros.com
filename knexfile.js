// Knex CLI configuration (used by `npx knex migrate:*` and by server/db.js).
//
// Connection convention: a single `DATABASE_URL` (e.g.
// `postgres://user:pass@host:5432/dbname`) is the source of truth. This
// matches docker-compose.yml (Phase 6), which injects `DATABASE_URL` into the
// `app` service directly, and keeps local/manual runs to one env var instead
// of juggling discrete PG*/POSTGRES_* pieces at query time.
const connection = process.env.DATABASE_URL || {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'budgetpwa',
};

/** @type { import("knex").Knex.Config } */
const config = {
  client: 'pg',
  connection,
  migrations: {
    directory: './server/migrations',
  },
};

export default config;
