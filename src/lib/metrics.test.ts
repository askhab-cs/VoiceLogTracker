import { describe, expect, it } from 'vitest';

import {
  canonicalUnit,
  convertMetricValue,
  fmtNum,
  isValidMeasure,
  normalizeMeasure,
  unitToKind,
} from './metrics';

describe('metrics', () => {
  it('formats whole and decimal numbers compactly', () => {
    expect(fmtNum(12)).toBe('12');
    expect(fmtNum(12.34)).toBe('12.3');
    expect(fmtNum(Number.NaN)).toBe('0');
  });

  it('maps supported units to metric kinds', () => {
    expect(unitToKind('minutes')).toBe('duration');
    expect(unitToKind('км')).toBe('distance');
    expect(unitToKind('رطل')).toBe('weight');
    expect(unitToKind('unknown')).toBe('count');
  });

  it('returns the canonical unit for each measured kind', () => {
    expect(canonicalUnit('duration')).toBe('min');
    expect(canonicalUnit('distance')).toBe('km');
    expect(canonicalUnit('weight')).toBe('kg');
    expect(canonicalUnit('pages')).toBeNull();
  });

  it('converts hours to minutes', () => {
    expect(convertMetricValue('duration', 1.5, 'hr')).toBe(90);
  });

  it('converts miles to kilometres', () => {
    expect(convertMetricValue('distance', 5, 'mi')).toBeCloseTo(8.04672, 5);
  });

  it('converts pounds to kilograms', () => {
    expect(convertMetricValue('weight', 220, 'lb')).toBeCloseTo(99.7903, 3);
  });

  it('normalises values to their canonical units', () => {
    expect(normalizeMeasure({ kind: 'duration', value: 2, unit: 'hr' })).toEqual({
      kind: 'duration',
      value: 120,
      unit: 'min',
    });
  });

  it('rejects invalid, negative, and mismatched measures', () => {
    expect(isValidMeasure({ kind: 'distance', value: 3, unit: 'km' })).toBe(true);
    expect(isValidMeasure({ kind: 'distance', value: -3, unit: 'km' })).toBe(false);
    expect(isValidMeasure({ kind: 'distance', value: 3, unit: 'kg' })).toBe(false);
    expect(isValidMeasure({ kind: 'invented', value: 3, unit: null })).toBe(false);
  });
});
