import { describe, it, expect, beforeEach } from 'vitest';

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

const { getData, getCategorySpent, getCategoryBudget, getCategoryRemaining, getMonthTotals } =
  await import('../../src/state.js');

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
  it('aggregates income, budgeted, spent and available totals', () => {
    expect(getMonthTotals(MONTH_KEY)).toEqual({
      income: 1000,
      totalBudgeted: 500,
      totalSpent: 175,
      totalAvailable: 1000 - 175
    });
  });
});
