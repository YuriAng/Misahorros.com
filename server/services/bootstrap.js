// Builds the shared "full bootstrap payload" shape returned by both
// GET /api/bootstrap (server/routes/index.js) and PUT /api/profiles/active
// (server/routes/profiles.js, design.md "PUT /api/profiles/active returns
// the same shape as GET /api/bootstrap deliberately: the switch is one
// round trip, and the client cannot render a half-swapped state"). One
// builder, one place to keep both call sites in sync.
import db from '../db.js';
import { SETTINGS_KEYS, mapSettingsRows } from './settings.js';
import { getMonthPayload } from './months.js';
import { serializeProfile } from './profiles.js';

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

/**
 * @param {import('knex').Knex|import('knex').Knex.Transaction} [executor] defaults to the shared db instance
 * @param {object} [options]
 * @param {string} [options.profileId] overrides the profile read from `settings.active_profile`
 *   (used by `PUT /api/profiles/active`, which writes the new value in the
 *   same transaction it reads it back from)
 * @param {string} [options.monthKey] overrides the month read from `settings.active_month`
 */
export async function buildBootstrapPayload(executor = db, { profileId, monthKey } = {}) {
  const settingsRows = await executor('settings').whereIn('key', SETTINGS_KEYS);
  const settings = mapSettingsRows(settingsRows);
  const activeProfileId = profileId || settings.activeProfile;

  const [categoryRows, profileRows] = await Promise.all([
    activeProfileId
      ? executor('categories').where({ profile_id: activeProfileId }).orderBy('created_at', 'asc')
      : Promise.resolve([]),
    executor('budget_profiles').where({ archived: false }).orderBy('created_at', 'asc'),
  ]);

  const effectiveMonthKey = monthKey || settings.activeMonth;
  const month =
    effectiveMonthKey && activeProfileId ? await getMonthPayload(activeProfileId, effectiveMonthKey, executor) : null;

  return {
    settings,
    profiles: profileRows.map(serializeProfile),
    categories: categoryRows.map(serializeCategory),
    month,
  };
}
