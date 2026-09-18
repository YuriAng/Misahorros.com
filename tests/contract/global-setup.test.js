import { describe, expect, it } from 'vitest';
import { hasStableConnection } from './global-setup.js';

describe('Postgres readiness policy', () => {
  it('requires two consecutive successful probes', () => {
    expect(hasStableConnection(1)).toBe(false);
    expect(hasStableConnection(2)).toBe(true);
  });
});
