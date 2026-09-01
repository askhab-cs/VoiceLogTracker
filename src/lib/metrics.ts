export type MetricKind =
  | 'duration'
  | 'pages'
  | 'distance'
  | 'sets'
  | 'reps'
  | 'weight'
  | 'calories'
  | 'count';

export type Measure = { kind: string; value: number; unit: string | null };

/** How a metric rolls up over a week on the Progress screen. */
export type Agg = 'sum' | 'max';

export type MetricDef = {
  kind: MetricKind;
  label: string; // i18n key for the metric's display name
  hasUnit: boolean; // true → show the unit (kg/min); false → show the word (sets/reps)
  defaultUnit: string | null;
  units: string[]; // selectable units (first = default); [] when unit-less
  agg: Agg; // weekly aggregation (weight tracks your best, the rest sum up)
  icon: string; // Ionicons name
};

export const METRICS: Record<MetricKind, MetricDef> = {
  duration: { kind: 'duration', label: 'mDuration', hasUnit: true, defaultUnit: 'min', units: ['min', 'hr'], agg: 'sum', icon: 'time-outline' },
  pages: { kind: 'pages', label: 'mPages', hasUnit: false, defaultUnit: null, units: [], agg: 'sum', icon: 'book-outline' },
  distance: { kind: 'distance', label: 'mDistance', hasUnit: true, defaultUnit: 'km', units: ['km', 'mi'], agg: 'sum', icon: 'map-outline' },
  sets: { kind: 'sets', label: 'mSets', hasUnit: false, defaultUnit: null, units: [], agg: 'sum', icon: 'layers-outline' },
  reps: { kind: 'reps', label: 'mReps', hasUnit: false, defaultUnit: null, units: [], agg: 'sum', icon: 'repeat-outline' },
  weight: { kind: 'weight', label: 'mWeight', hasUnit: true, defaultUnit: 'kg', units: ['kg', 'lb'], agg: 'max', icon: 'barbell-outline' },
  calories: { kind: 'calories', label: 'mCalories', hasUnit: true, defaultUnit: 'kcal', units: ['kcal'], agg: 'sum', icon: 'flame-outline' },
  count: { kind: 'count', label: 'mCount', hasUnit: false, defaultUnit: null, units: [], agg: 'sum', icon: 'ellipse-outline' },
};

/** Order used for the "add detail" chips and progress rows. */
export const METRIC_ORDER: MetricKind[] = [
  'duration',
  'pages',
  'distance',
  'sets',
  'reps',
  'weight',
  'calories',
  'count',
];

const UNIT_FACTORS: Partial<Record<MetricKind, Record<string, number>>> = {
  duration: { min: 1, hr: 60 },
  distance: { km: 1, mi: 1.609344 },
  weight: { kg: 1, lb: 0.45359237 },
  calories: { kcal: 1 },
};

export function isMetricKind(kind: string): kind is MetricKind {
  return Object.prototype.hasOwnProperty.call(METRICS, kind);
}

export function canonicalUnit(kind: string): string | null {
  return metricDef(kind).defaultUnit;
}

/** Convert compatible values through the metric's canonical unit. */
export function convertMetricValue(
  kind: string,
  value: number,
  fromUnit: string | null,
  toUnit: string | null = canonicalUnit(kind)
): number {
  if (!Number.isFinite(value)) return 0;
  const factors = UNIT_FACTORS[kind as MetricKind];
  if (!factors) return value;
  const from = (fromUnit || canonicalUnit(kind) || '').toLowerCase();
  const to = (toUnit || canonicalUnit(kind) || '').toLowerCase();
  const fromFactor = factors[from];
  const toFactor = factors[to];
  if (!fromFactor || !toFactor) return value;
  return (value * fromFactor) / toFactor;
}

export function normalizeMeasure(m: Measure): Measure {
  const kind = isMetricKind(m.kind) ? m.kind : 'count';
  const def = metricDef(kind);
  const unit = def.hasUnit ? def.defaultUnit : kind === 'count' ? m.unit : null;
  return {
    kind,
    value: convertMetricValue(kind, m.value, m.unit, unit),
    unit,
  };
}

export function isValidMeasure(m: Measure): boolean {
  if (!isMetricKind(m.kind) || !Number.isFinite(m.value) || m.value <= 0) return false;
  const def = metricDef(m.kind);
  if (!def.hasUnit) return m.unit == null || m.kind === 'count';
  const unit = (m.unit || def.defaultUnit || '').toLowerCase();
  return def.units.includes(unit);
}

export function metricDef(kind: string): MetricDef {
  return (METRICS as Record<string, MetricDef>)[kind] ?? METRICS.count;
}

type TFn = (key: any, params?: Record<string, string | number>) => string;

/** Canonical unit → i18n key (so kg/min/km localize); unknown units pass through. */
const UNIT_I18N: Record<string, string> = {
  min: 'unitMin',
  hr: 'unitHr',
  km: 'unitKm',
  mi: 'unitMi',
  kg: 'unitKg',
  lb: 'unitLb',
  kcal: 'unitKcal',
};

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

export function unitLabel(unit: string | null, t: TFn): string {
  if (!unit) return '';
  const key = UNIT_I18N[unit.toLowerCase()];
  return key ? t(key) : unit;
}

/** Localized metric name, e.g. for chips and progress rows ("Weight", "sets"). */
export function metricName(kind: string, t: TFn): string {
  return t(metricDef(kind).label);
}

/** Localized compact value, e.g. "80 kg", "3 sets", "20 pages", "350 kcal". */
export function formatMeasure(m: Measure, t: TFn): string {
  const def = metricDef(m.kind);
  const v = fmtNum(m.value);
  if (def.hasUnit) {
    const u = m.unit || def.defaultUnit;
    return u ? `${v} ${unitLabel(u, t)}` : v;
  }
  if (m.kind === 'count') return m.unit ? `${v} ${m.unit}` : v;
  // countable, unit-less kinds: value + word (sets / reps / pages)
  if (m.unit) return `${v} ${unitLabel(m.unit, t)}`;
  return `${v} ${metricName(m.kind, t)}`;
}

/**
 * Best-effort mapping of a free-text unit to a metric kind. Used when migrating
 * old single-quantity entries and as a fallback for legacy server responses.
 */
export function unitToKind(unit: string | null): MetricKind {
  if (!unit) return 'count';
  const u = unit.toLowerCase().trim();
  const has = (...xs: string[]) => xs.includes(u);
  if (has('min', 'mins', 'minute', 'minutes', 'hr', 'hrs', 'hour', 'hours', 'мин', 'минут', 'минута', 'минуты', 'час', 'часа', 'часов', 'دقيقة', 'دقائق', 'ساعة'))
    return 'duration';
  if (has('km', 'kilometer', 'kilometers', 'mi', 'mile', 'miles', 'км', 'километр', 'километра', 'ميل', 'كم', 'كيلومتر'))
    return 'distance';
  if (has('kg', 'kgs', 'kilogram', 'kilograms', 'lb', 'lbs', 'pound', 'pounds', 'кг', 'килограмм', 'كجم', 'كغ', 'رطل'))
    return 'weight';
  if (has('page', 'pages', 'pg', 'стр', 'страница', 'страниц', 'страницы', 'صفحة', 'صفحات')) return 'pages';
  if (has('kcal', 'cal', 'calorie', 'calories', 'ккал', 'калорий', 'سعرة', 'سعرات')) return 'calories';
  if (has('rep', 'reps', 'повтор', 'повтора', 'повторов', 'تكرار', 'تكرارات')) return 'reps';
  if (has('set', 'sets', 'подход', 'подхода', 'подходов', 'مجموعة', 'مجموعات')) return 'sets';
  return 'count';
}
