// GET/POST /api/funds, PATCH/DELETE /api/funds/{id}, GET/POST
// /api/funds/{id}/movements (design.md "API Contract", savings-funds spec
// "Fund Entity", "Fund Movements", "Derived Fund Balance"). Every handler
// is scoped to `req.profileId`, resolved upstream by `requireActiveProfile`.
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { generateId } from '../utils.js';
import { materializeMonth, monthKeyFromDate, startOfDayInTz } from '../services/months.js';
import { archiveFund, computeFundBalance, listFundsWithBalance, serializeFund, serializeFundMovement } from '../services/funds.js';

const router = Router();

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MOVEMENT_TYPES = ['deposit', 'withdrawal'];
const DEFAULT_MOVEMENTS_LIMIT = 50;
const MAX_MOVEMENTS_LIMIT = 200;

// A bare "YYYY-MM-DD" (from the `<input type="date">` on the movement form)
// is parsed as midnight in the app's timezone, not UTC — mirrors
// server/routes/transactions.js:parseDate exactly (Bug Fix B).
function parseMovementDate(date) {
  if (!date) return new Date();
  const d = DATE_ONLY_RE.test(date) ? startOfDayInTz(date) : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw badRequest('date is invalid', 'date');
  }
  return d;
}

// Case-insensitive, btrim-insensitive duplicate check among LIVE funds of
// the SAME profile only — mirrors `funds_live_name_unique` (design.md
// "Target Schema"), so an archived name never blocks a new fund with the
// same name, and two profiles may each have a fund of the same name.
async function findDuplicateLiveName(executor, profileId, name, excludeId) {
  let query = executor('funds')
    .where({ profile_id: profileId, archived: false })
    .whereRaw('lower(btrim(name)) = lower(btrim(?))', [name]);
  if (excludeId) query = query.whereNot({ id: excludeId });
  return query.first();
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeArchived = req.query.includeArchived === '1';
    const funds = await listFundsWithBalance(db, req.profileId, { includeArchived });
    res.json(funds);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, name } = req.body || {};
    if (!name || !String(name).trim()) {
      throw badRequest('name is required', 'name');
    }
    const trimmedName = String(name).trim();
    const fundId = id || generateId('fnd');

    const duplicate = await findDuplicateLiveName(db, req.profileId, trimmedName);
    if (duplicate) {
      throw conflict(`A live fund named "${trimmedName}" already exists`, 'duplicate_name');
    }

    const [row] = await db('funds')
      .insert({ id: fundId, profile_id: req.profileId, name: trimmedName, archived: false })
      .returning('*');

    res.status(201).json(serializeFund({ ...row, balance: 0 }));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body || {};

    // Scoped by profile_id so a foreign id — one that exists but belongs to
    // another profile — returns 404 exactly like an unknown id (budget-api
    // spec, "Referencing a fund from another profile returns 404").
    const existing = await db('funds').where({ id, profile_id: req.profileId }).first();
    if (!existing) throw notFound(`Fund ${id} not found`);

    if (name === undefined) {
      const balance = await computeFundBalance(db, req.profileId, id);
      return res.json(serializeFund({ ...existing, balance }));
    }

    if (!String(name).trim()) throw badRequest('name cannot be blank', 'name');
    const trimmedName = String(name).trim();

    const duplicate = await findDuplicateLiveName(db, req.profileId, trimmedName, id);
    if (duplicate) {
      throw conflict(`A live fund named "${trimmedName}" already exists`, 'duplicate_name');
    }

    const [updated] = await db('funds').where({ id, profile_id: req.profileId }).update({ name: trimmedName }).returning('*');
    const balance = await computeFundBalance(db, req.profileId, id);
    res.json(serializeFund({ ...updated, balance }));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await archiveFund(req.profileId, req.params.id);
    res.status(204).end();
  })
);

router.get(
  '/:id/movements',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const fund = await db('funds').where({ id, profile_id: req.profileId }).first();
    if (!fund) throw notFound(`Fund ${id} not found`);

    let limit = DEFAULT_MOVEMENTS_LIMIT;
    if (req.query.limit !== undefined) {
      const parsed = Number(req.query.limit);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = Math.min(Math.trunc(parsed), MAX_MOVEMENTS_LIMIT);
      }
    }

    const rows = await db('fund_movements')
      .where({ profile_id: req.profileId, fund_id: id })
      .orderBy([
        { column: 'date', order: 'desc' },
        { column: 'id', order: 'desc' },
      ])
      .limit(limit);

    res.json(rows.map(serializeFundMovement));
  })
);

// One movement endpoint, not /deposit + /withdraw: the sequence is
// byte-identical for both types (design.md "One movement endpoint, not
// /deposit + /withdraw"). An invalid `type` is a loud 400.
router.post(
  '/:id/movements',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { id: movementId, type, amount, note, date } = req.body || {};

    if (!MOVEMENT_TYPES.includes(type)) {
      throw badRequest(`type must be one of: ${MOVEMENT_TYPES.join(', ')}`, 'type');
    }
    if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      throw badRequest('amount must be a positive number', 'amount');
    }

    const movementDate = parseMovementDate(date);
    // `month_key` is ALWAYS derived server-side from the movement's own
    // `date` — never trusted from the client (Bug Fix B, savings-funds
    // spec "Fund Movements").
    const monthKey = monthKeyFromDate(movementDate);

    const result = await db.transaction(async (trx) => {
      // `forUpdate()` serializes this write against a concurrent archive
      // (archiveFund takes the SAME lock) — design.md "Decision: archiving
      // a fund with a nonzero balance is refused with 409 fund_has_balance".
      const fund = await trx('funds').where({ id, profile_id: req.profileId }).forUpdate().first();
      if (!fund) throw notFound(`Fund ${id} not found`);
      if (fund.archived) {
        throw conflict('Este fondo está archivado y no acepta nuevos movimientos.', 'fund_archived');
      }

      if (type === 'withdrawal') {
        const balance = await computeFundBalance(trx, req.profileId, id);
        if (balance < Number(amount)) {
          throw conflict(`Saldo insuficiente (${balance}) para retirar ${amount}.`, 'insufficient_funds');
        }
      }

      // REQUIRED — the composite FK to months(profile_id, month_key)
      // rejects the insert otherwise.
      await materializeMonth(trx, req.profileId, monthKey);

      const [inserted] = await trx('fund_movements')
        .insert({
          id: movementId || generateId('fmv'),
          profile_id: req.profileId,
          fund_id: id,
          month_key: monthKey,
          type,
          amount: Number(amount),
          note: note ? String(note).trim() : '',
          date: movementDate,
        })
        .returning('*');

      const balance = await computeFundBalance(trx, req.profileId, id);
      return { movement: inserted, balance };
    });

    res.status(201).json({ movement: serializeFundMovement(result.movement), balance: result.balance });
  })
);

export default router;
