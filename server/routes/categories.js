// GET/POST /api/categories, PATCH /api/categories/{id}. `budget`+`monthKey`
// on create/update are applied atomically with materializing the month
// (design.md REST API Contract).
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

async function applyBudget(trx, { categoryId, budget, monthKey }) {
  if (budget == null || !monthKey) return;
  await materializeMonth(trx, monthKey);
  await trx('category_budgets')
    .insert({ month_key: monthKey, category_id: categoryId, amount: Number(budget) || 0 })
    .onConflict(['month_key', 'category_id'])
    .merge();
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db('categories').orderBy('created_at', 'asc');
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
          name: String(name).trim(),
          icon: icon ? String(icon).trim() : '💸',
          color: color || '#4F8EF7',
          archived: false,
        })
        .returning('*');

      await applyBudget(trx, { categoryId, budget, monthKey });

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

    const existing = await db('categories').where({ id }).first();
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
        [updated] = await trx('categories').where({ id }).update(updates).returning('*');
      }

      await applyBudget(trx, { categoryId: id, budget, monthKey });

      return updated;
    });

    res.json(serializeCategory(row));
  })
);

export default router;
