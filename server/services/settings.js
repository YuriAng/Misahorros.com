// Single source of truth for which `settings` keys the API reads
// (design.md "Duplicated settings whitelist" risk — `server/routes/settings.js:11`
// and `server/routes/index.js:28` used to hardcode two copies of the same
// array, and updating one without the other made `GET /bootstrap` silently
// omit a key). `active_profile` is included here so both GET /api/settings
// and GET /api/bootstrap can surface `activeProfile` without a third
// hardcoded array. `PUT /api/settings` still rejects writes to it — see
// `server/routes/settings.js` — switching the active profile is always a
// dedicated `PUT /api/profiles/active` call, never a plain settings write.
export const SETTINGS_KEYS = ['currency', 'active_month', 'active_profile'];

/**
 * Maps raw `settings` rows (as returned by `.whereIn('key', SETTINGS_KEYS)`)
 * into the response shape shared by `GET /api/settings` and the `settings`
 * field of every bootstrap-shaped payload.
 *
 * @param {Array<{key: string, value: string}>} rows
 */
export function mapSettingsRows(rows) {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    currency: map.currency || 'USD',
    activeMonth: map.active_month || null,
    activeProfile: map.active_profile || null,
  };
}
