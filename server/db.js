import knex from 'knex';
import pg from 'pg';
import knexConfig from '../knexfile.js';

// Postgres NUMERIC (OID 1700) is returned as a string by `pg` to avoid
// float-precision surprises. This app treats money as plain JS numbers
// throughout (client and server), so parse NUMERIC to a float here, once,
// globally — otherwise every amount reaches JSON as `"12.00"` and breaks
// render.js's arithmetic (see design.md "Notes" under the DDL section).
pg.types.setTypeParser(1700, parseFloat);

const db = knex(knexConfig);

export default db;
