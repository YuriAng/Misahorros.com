import { describe, it, expect, beforeEach, vi } from 'vitest';

// `setActiveProfile()` is the ONLY place the cache is reset (design.md
// "Decision: Client cache is reset on switch, not keyed by profile"). The
// stub replaces just `setActiveProfile` so every other `api.*` call in this
// file keeps hitting the real (unmocked) implementation, matching the
// existing convention of this file exercising src/state.js in isolation.
vi.mock('../../src/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    setActiveProfile: vi.fn(),
    createFund: vi.fn(),
    renameFund: vi.fn(),
    archiveFund: vi.fn(),
    createFundMovement: vi.fn()
  };
});

// src/state.js imports src/storage.js, which reads/writes the browser
// `localStorage` global at module load time. The vitest environment for
// this suite is plain `node` (per vitest.config.js), so that global does
// not exist here. We install a minimal in-memory stand-in BEFORE
// dynamically importing state.js, since ES module static imports would
// otherwise evaluate state.js (and its top-level localStorage access)
// before any code in this file could run.
function createLocalStorageMock() {
  let store = {};
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
}

globalThis.localStorage = createLocalStorageMock();

const {
  getData,
  getCategorySpent,
  getCategoryBudget,
  getCategoryRemaining,
  getMonthTotals,
  setActiveProfile,
  getFunds,
  getFundBalance,
  getFundMonthMovements,
  addFund,
  renameFund,
  archiveFund,
  addFundMovement
} = await import('../../src/state.js');
const api = await import('../../src/api.js');

const MONTH_KEY = '2026-01';

// Literal cache fixture matching the `defaultData()` month shape. Written
// directly into the module's cache (via getData(), which returns the live
// reference) so `ensureMonth` finds it already present and returns it
// as-is — no previous-month carry-forward copy or localStorage write.
function installMonthFixture() {
  const state = getData();
  state.months[MONTH_KEY] = {
    income: { amount: 1000, updatedAt: '2026-01-01T00:00:00.000Z' },
    budgets: { cat_a: 300, cat_b: 200 },
    transactions: [
      { id: 'txn_1', categoryId: 'cat_a', amount: 50, note: '', date: '2026-01-05T00:00:00.000Z' },
      { id: 'txn_2', categoryId: 'cat_a', amount: 25, note: '', date: '2026-01-06T00:00:00.000Z' },
      { id: 'txn_3', categoryId: 'cat_b', amount: 100, note: '', date: '2026-01-07T00:00:00.000Z' }
    ]
  };
}

beforeEach(() => {
  installMonthFixture();
});

describe('getCategorySpent', () => {
  it('sums transaction amounts for a category with transactions', () => {
    expect(getCategorySpent(MONTH_KEY, 'cat_a')).toBe(75);
    expect(getCategorySpent(MONTH_KEY, 'cat_b')).toBe(100);
  });

  it('returns 0 for a category with no transactions in the month', () => {
    expect(getCategorySpent(MONTH_KEY, 'cat_without_transactions')).toBe(0);
  });
});

describe('getCategoryBudget', () => {
  it('returns the budgeted amount for a category', () => {
    expect(getCategoryBudget(MONTH_KEY, 'cat_a')).toBe(300);
    expect(getCategoryBudget(MONTH_KEY, 'cat_b')).toBe(200);
  });

  it('returns 0 for a category with no budget entry', () => {
    expect(getCategoryBudget(MONTH_KEY, 'cat_without_budget')).toBe(0);
  });
});

describe('getCategoryRemaining', () => {
  it('returns budget minus spent for a category', () => {
    expect(getCategoryRemaining(MONTH_KEY, 'cat_a')).toBe(225);
    expect(getCategoryRemaining(MONTH_KEY, 'cat_b')).toBe(100);
  });

  it('can be negative when spent exceeds budget', () => {
    const state = getData();
    state.months[MONTH_KEY].transactions.push({
      id: 'txn_4',
      categoryId: 'cat_b',
      amount: 500,
      note: '',
      date: '2026-01-08T00:00:00.000Z'
    });
    expect(getCategoryRemaining(MONTH_KEY, 'cat_b')).toBe(200 - 600);
  });
});

describe('getMonthTotals', () => {
  // `installMonthFixture()` never sets `fundMovements` on the month, which
  // pins the defensive `|| []` fallback (design.md "una función pura de
  // lectura nunca debe lanzar"): a month cached by a version of the client
  // that predates funds must still return zeros, never throw.
  it('aggregates income, budgeted, spent and available totals when fundMovements is absent (stale cache)', () => {
    expect(getMonthTotals(MONTH_KEY)).toEqual({
      income: 1000,
      totalBudgeted: 500,
      totalSpent: 175,
      fundDeposits: 0,
      fundWithdrawals: 0,
      totalAvailable: 1000 - 175
    });
  });

  it('computes fundDeposits and lowers totalAvailable when only deposits exist this month', () => {
    const state = getData();
    state.months[MONTH_KEY].fundMovements = [
      { id: 'fmv_1', fundId: 'fnd_a', type: 'deposit', amount: 300, note: '', date: '2026-01-05T00:00:00.000Z' },
      { id: 'fmv_2', fundId: 'fnd_a', type: 'deposit', amount: 50, note: '', date: '2026-01-06T00:00:00.000Z' }
    ];
    expect(getMonthTotals(MONTH_KEY)).toEqual({
      income: 1000,
      totalBudgeted: 500,
      totalSpent: 175,
      fundDeposits: 350,
      fundWithdrawals: 0,
      totalAvailable: 1000 - 175 - 350 + 0
    });
  });

  it('computes fundWithdrawals and raises totalAvailable when only withdrawals exist this month', () => {
    const state = getData();
    state.months[MONTH_KEY].fundMovements = [
      { id: 'fmv_3', fundId: 'fnd_a', type: 'withdrawal', amount: 80, note: '', date: '2026-01-07T00:00:00.000Z' }
    ];
    expect(getMonthTotals(MONTH_KEY)).toEqual({
      income: 1000,
      totalBudgeted: 500,
      totalSpent: 175,
      fundDeposits: 0,
      fundWithdrawals: 80,
      totalAvailable: 1000 - 175 - 0 + 80
    });
  });

  it('keeps both gross terms independently visible for a same-amount deposit and withdrawal in one month', () => {
    const state = getData();
    state.months[MONTH_KEY].fundMovements = [
      { id: 'fmv_4', fundId: 'fnd_a', type: 'deposit', amount: 200, note: '', date: '2026-01-08T00:00:00.000Z' },
      { id: 'fmv_5', fundId: 'fnd_a', type: 'withdrawal', amount: 200, note: '', date: '2026-01-09T00:00:00.000Z' }
    ];
    expect(getMonthTotals(MONTH_KEY)).toEqual({
      income: 1000,
      totalBudgeted: 500,
      totalSpent: 175,
      fundDeposits: 200,
      fundWithdrawals: 200,
      totalAvailable: 1000 - 175 - 200 + 200
    });
  });
});

// Literal fixture for the fund readers/mutators below — a live fund with a
// nonzero balance and an archived fund that must be excluded from getFunds().
function installFundsFixture() {
  const state = getData();
  state.funds = [
    { id: 'fnd_ahorro', name: 'Ahorro', archived: false, createdAt: '2026-01-01T00:00:00.000Z', balance: 1000 },
    { id: 'fnd_viejo', name: 'Viejo', archived: true, createdAt: '2026-01-01T00:00:00.000Z', balance: 0 }
  ];
}

describe('getFunds', () => {
  it('returns only non-archived funds', () => {
    installFundsFixture();
    expect(getFunds()).toEqual([
      { id: 'fnd_ahorro', name: 'Ahorro', archived: false, createdAt: '2026-01-01T00:00:00.000Z', balance: 1000 }
    ]);
  });
});

describe('getFundBalance', () => {
  it('returns the cached balance for a known fund', () => {
    installFundsFixture();
    expect(getFundBalance('fnd_ahorro')).toBe(1000);
  });

  it('returns 0 for an unknown fund id', () => {
    installFundsFixture();
    expect(getFundBalance('fnd_unknown')).toBe(0);
  });
});

describe('getFundMonthMovements', () => {
  it('returns only the movements for the given fund in the given month', () => {
    const state = getData();
    state.months[MONTH_KEY].fundMovements = [
      { id: 'fmv_1', fundId: 'fnd_ahorro', type: 'deposit', amount: 300, note: '', date: '2026-01-05T00:00:00.000Z' },
      { id: 'fmv_2', fundId: 'fnd_otro', type: 'deposit', amount: 50, note: '', date: '2026-01-06T00:00:00.000Z' }
    ];
    expect(getFundMonthMovements(MONTH_KEY, 'fnd_ahorro')).toEqual([
      { id: 'fmv_1', fundId: 'fnd_ahorro', type: 'deposit', amount: 300, note: '', date: '2026-01-05T00:00:00.000Z' }
    ]);
  });
});

describe('addFund', () => {
  it('calls the API, pushes the created fund into cache.funds, and returns it', async () => {
    const created = { id: 'fnd_nuevo', name: 'Nuevo', archived: false, createdAt: '2026-01-10T00:00:00.000Z', balance: 0 };
    api.createFund.mockResolvedValueOnce(created);

    const result = await addFund('Nuevo');

    expect(api.createFund).toHaveBeenCalledWith({ name: 'Nuevo' });
    expect(result).toEqual(created);
    expect(getData().funds).toContainEqual(created);
  });
});

describe('renameFund', () => {
  it('calls the API and replaces the fund in place', async () => {
    installFundsFixture();
    const updated = {
      id: 'fnd_ahorro',
      name: 'Ahorro renombrado',
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      balance: 1000
    };
    api.renameFund.mockResolvedValueOnce(updated);

    await renameFund('fnd_ahorro', 'Ahorro renombrado');

    expect(api.renameFund).toHaveBeenCalledWith('fnd_ahorro', 'Ahorro renombrado');
    expect(getData().funds.find((f) => f.id === 'fnd_ahorro')).toEqual(updated);
  });
});

describe('archiveFund', () => {
  it('calls the API and marks the fund archived in place, without changing its cached balance', async () => {
    installFundsFixture();
    api.archiveFund.mockResolvedValueOnce(null);

    await archiveFund('fnd_ahorro');

    expect(api.archiveFund).toHaveBeenCalledWith('fnd_ahorro');
    const fund = getData().funds.find((f) => f.id === 'fnd_ahorro');
    expect(fund.archived).toBe(true);
    expect(fund.balance).toBe(1000);
  });
});

describe('addFundMovement', () => {
  it('updates the fund balance from the response (no re-fetch) and unshifts the movement into the SERVER-derived month, not the viewed one', async () => {
    installFundsFixture();
    api.createFundMovement.mockResolvedValueOnce({
      movement: {
        id: 'fmv_x',
        fundId: 'fnd_ahorro',
        type: 'deposit',
        amount: 200,
        note: '',
        date: '2026-02-01T00:00:00.000Z',
        monthKey: '2026-02'
      },
      balance: 1200
    });

    const result = await addFundMovement('fnd_ahorro', { type: 'deposit', amount: 200, note: '', date: '2026-02-01' });

    expect(api.createFundMovement).toHaveBeenCalledWith('fnd_ahorro', {
      type: 'deposit',
      amount: 200,
      note: '',
      date: '2026-02-01'
    });
    // Balance comes straight from the response — no second request.
    expect(getFundBalance('fnd_ahorro')).toBe(1200);
    // '2026-02' is the SERVER's derived month, not MONTH_KEY ('2026-01'),
    // which is the month the test is "viewing".
    expect(getData().months['2026-02'].fundMovements[0]).toEqual({
      id: 'fmv_x',
      fundId: 'fnd_ahorro',
      type: 'deposit',
      amount: 200,
      note: '',
      date: '2026-02-01T00:00:00.000Z'
    });
    expect(result).toEqual({
      id: 'fmv_x',
      fundId: 'fnd_ahorro',
      type: 'deposit',
      amount: 200,
      note: '',
      date: '2026-02-01T00:00:00.000Z',
      monthKey: '2026-02'
    });
  });
});

// design.md "Decision: Client cache is reset on switch, not keyed by
// profile": setActiveProfile() replaces the cache WHOLESALE, never a merge,
// so a row from the profile just left behind is unrepresentable afterwards.
describe('setActiveProfile', () => {
  it('replaces settings/profiles/categories/funds and empties cache.months, so a stale row from the previous profile is unrepresentable', async () => {
    const state = getData();
    // Pollute the cache with data belonging to the profile being left, in a
    // month that the new profile's payload does NOT mention.
    state.months['2026-02'] = {
      income: { amount: 999, updatedAt: '2026-02-01T00:00:00.000Z' },
      budgets: { cat_stale: 100 },
      transactions: [{ id: 'txn_stale', categoryId: 'cat_stale', amount: 10, note: '', date: '2026-02-01T00:00:00.000Z' }]
    };
    state.categories = [
      { id: 'cat_stale', name: 'Stale', icon: '❓', color: '#000000', archived: false, createdAt: '2026-01-01T00:00:00.000Z' }
    ];
    state.settings.activeProfile = 'prof_default';
    state.profiles = [{ id: 'prof_default', name: 'General', archived: false, createdAt: '2026-01-01T00:00:00.000Z' }];
    // CRITICAL CACHE-LEAK FIX (task 4.4): pre-populate cache.funds with the
    // profile being left behind's own fund, in the exact shape bootstrap()
    // and addFund() leave it in — a stale `balance` is the leak this test
    // guards against, not just a stale name.
    state.funds = [
      { id: 'fnd_stale', name: 'Stale Fund', archived: false, createdAt: '2026-01-01T00:00:00.000Z', balance: 777 }
    ];

    api.setActiveProfile.mockResolvedValueOnce({
      settings: { currency: 'USD', activeMonth: MONTH_KEY, activeProfile: 'prof_negocio' },
      profiles: [
        { id: 'prof_default', name: 'General', archived: false, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'prof_negocio', name: 'Negocio', archived: false, createdAt: '2026-01-02T00:00:00.000Z' }
      ],
      categories: [
        { id: 'cat_fresh', name: 'Fresh', icon: '🆕', color: '#111111', archived: false, createdAt: '2026-01-02T00:00:00.000Z' }
      ],
      funds: [
        { id: 'fnd_fresh', name: 'Fresh Fund', archived: false, createdAt: '2026-01-02T00:00:00.000Z', balance: 0 }
      ],
      month: {
        monthKey: MONTH_KEY,
        income: { amount: 500, updatedAt: '2026-01-01T00:00:00.000Z' },
        budgets: {},
        transactions: [],
        fundMovements: [],
        materialized: true,
        carryForward: { available: false, sourceMonth: null }
      }
    });

    await setActiveProfile('prof_negocio');

    expect(api.setActiveProfile).toHaveBeenCalledWith('prof_negocio');
    expect(getData().settings.activeProfile).toBe('prof_negocio');
    expect(getData().categories).toEqual([
      { id: 'cat_fresh', name: 'Fresh', icon: '🆕', color: '#111111', archived: false, createdAt: '2026-01-02T00:00:00.000Z' }
    ]);
    expect(getData().profiles.map(p => p.id)).toEqual(['prof_default', 'prof_negocio']);
    // Zero trace of the old profile's fund — not zeroed out, absent entirely.
    expect(getData().funds).toEqual([
      { id: 'fnd_fresh', name: 'Fresh Fund', archived: false, createdAt: '2026-01-02T00:00:00.000Z', balance: 0 }
    ]);
    expect(getData().funds.find((f) => f.id === 'fnd_stale')).toBeUndefined();
    // The stale month is gone entirely — not zeroed, unrepresentable.
    expect(getData().months['2026-02']).toBeUndefined();
    expect(getData().months[MONTH_KEY]).toEqual({
      income: { amount: 500, updatedAt: '2026-01-01T00:00:00.000Z' },
      budgets: {},
      transactions: [],
      fundMovements: [],
      materialized: true,
      carryForward: { available: false, sourceMonth: null }
    });
  });
});
