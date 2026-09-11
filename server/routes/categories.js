// GET/POST /api/categories, PATCH /api/categories/{id}. `budget`+`monthKey`
// on create/update are applied atomically with materializing the month
// (design.md REST API Contract). Every handler is scoped to
// `req.profileId`, resolved upstream by `requireActiveProfile`.
import { Router } from 'express';
import db from '../db.js';
import { asyncHandler } from '../asyncHandler.js';
import { badRequest, notFound } from '../errors.js';
import { generateId } from '../utils.js';
import { materializeMonth } from '../services/months.js';

const router = Router();

function serializeCategory(row) {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    archived: row.archived,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

async function applyBudget(trx, { profileId, categoryId, budget, monthKey }) {
  if (budget == null || !monthKey) return;
  await materializeMonth(trx, profileId, monthKey);
  await trx('category_budgets')
    .insert({ profile_id: profileId, month_key: monthKey, category_id: categoryId, amount: Number(budget) || 0 })
    .onConflict(['profile_id', 'month_key', 'category_id'])
    .merge();
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db('categories').where({ profile_id: req.profileId }).orderBy('created_at', 'asc');
    res.json(rows.map(serializeCategory));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { id, name, icon, color, budget, monthKey } = req.body || {};
    if (!name || !String(name).trim()) {
      throw badRequest('name is required', 'name');
    }
    const categoryId = id || generateId('cat');

    const row = await db.transaction(async (trx) => {
      const [inserted] = await trx('categories')
        .insert({
          id: categoryId,
          profile_id: req.profileId,
          name: String(name).trim(),
          icon: icon ? String(icon).trim() : '💸',
          color: color || '#4F8EF7',
          archived: false,
        })
        .returning('*');

      await applyBudget(trx, { profileId: req.profileId, categoryId, budget, monthKey });

      return inserted;
    });

    res.status(201).json(serializeCategory(row));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, icon, color, archived, budget, monthKey } = req.body || {};

    // Scoped by profile_id so a foreign id — one that exists but belongs to
    // another profile — returns 404 exactly like an unknown id, never
    // exposing whether the id exists elsewhere (design.md "Cross-profile
    // write paths that composite FKs do not close").
    const existing = await db('categories').where({ id, profile_id: req.profileId }).first();
    if (!existing) throw notFound(`Category ${id} not found`);

    const updates = {};
    if (name !== undefined) {
      if (!String(name).trim()) throw badRequest('name cannot be blank', 'name');
      updates.name = String(name).trim();
    }
    if (icon !== undefined) updates.icon = String(icon).trim() || existing.icon;
    if (color !== undefined) updates.color = color;
    if (archived !== undefined) updates.archived = Boolean(archived);

    const row = await db.transaction(async (trx) => {
      let updated = existing;
      if (Object.keys(updates).length) {
        [updated] = await trx('categories').where({ id, profile_id: req.profileId }).update(updates).returning('*');
      }

      await applyBudget(trx, { profileId: req.profileId, categoryId: id, budget, monthKey });

      return updated;
    });

    res.json(serializeCategory(row));
  })
);

export default router;
