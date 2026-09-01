import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { HabitStat } from './db';

vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: vi.fn(),
    getAllSync: vi.fn(() => []),
    getFirstSync: vi.fn(() => undefined),
    runSync: vi.fn(() => ({ lastInsertRowId: 1, changes: 1 })),
    withTransactionSync: vi.fn((callback: () => void) => callback()),
  }),
}));

let db: typeof import('./db');

beforeAll(async () => {
  db = await import('./db');
});

describe('database calculations', () => {
  it('stores local dates in YYYY-MM-DD format', () => {
    expect(db.toDateStr(new Date(2026, 8, 1, 23, 30))).toBe('2026-09-01');
  });

  it('uses Monday as the first day of the week', () => {
    expect(db.toDateStr(db.startOfWeek(new Date(2026, 8, 3)))).toBe('2026-08-31');
    expect(db.toDateStr(db.startOfWeek(new Date(2026, 8, 6)))).toBe('2026-08-31');
  });

  it('counts a streak that includes today', () => {
    const logged = new Set(['2026-08-30', '2026-08-31', '2026-09-01']);
    expect(db.calculateStreak(logged, new Date(2026, 8, 1))).toBe(3);
  });

  it('allows an active streak to end yesterday', () => {
    const logged = new Set(['2026-08-29', '2026-08-30', '2026-08-31']);
    expect(db.calculateStreak(logged, new Date(2026, 8, 1))).toBe(3);
  });

  it('stops a streak at the first missing day', () => {
    const logged = new Set(['2026-08-29', '2026-08-31', '2026-09-01']);
    expect(db.calculateStreak(logged, new Date(2026, 8, 1))).toBe(2);
  });

  it('calculates progress for a days-per-week goal', () => {
    const stat = {
      weekDays: 3,
      goal: { habitId: 1, type: 'count' as const, target: 5, unit: null, metric: null },
      metrics: [],
      primary: null,
    } as unknown as HabitStat;
    expect(db.goalProgress(stat)).toEqual({ current: 3, target: 5, pct: 0.6 });
  });

  it('uses the weekly maximum for a weight goal', () => {
    const weight = {
      kind: 'weight', unit: 'kg', count: 2, weekSum: 180, weekMax: 100,
      totalSum: 180, best: 100, last: 100, lastDate: '2026-09-01',
    };
    const stat = {
      weekDays: 2,
      goal: { habitId: 1, type: 'quantity' as const, target: 264.5547, unit: 'lb', metric: 'weight' },
      metrics: [weight],
      primary: weight,
    } as unknown as HabitStat;
    const result = db.goalProgress(stat);
    expect(result.current).toBe(100);
    expect(result.target).toBeCloseTo(120, 3);
    expect(result.pct).toBeCloseTo(100 / 120, 3);
  });
});
