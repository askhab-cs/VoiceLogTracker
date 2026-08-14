import * as SQLite from 'expo-sqlite';

import { metricDef, unitToKind, type Measure } from './metrics';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */
export type { Measure } from './metrics';

export type EntryRow = {
  id: number;
  habit_id: number;
  name: string;
  category: string | null; // group this activity belongs to (e.g. "Gym")
  log_date: string; // YYYY-MM-DD (local)
  raw_text: string;
  confident: number; // 0 | 1
  measures: Measure[];
};

export type MeasureInput = { kind: string; value: number; unit?: string | null };

export type NewEntry = {
  name: string;
  logDate: string;
  rawText: string;
  confident?: boolean;
  measures?: MeasureInput[];
  // string → set/keep category; null → clear it; undefined → leave untouched
  category?: string | null;
};

/* ------------------------------------------------------------------ */
/* Connection + schema                                               */
/* ------------------------------------------------------------------ */
const db = SQLite.openDatabaseSync('voicelog.db');

export function initDb() {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS habits (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS entries (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id  INTEGER NOT NULL,
      log_date  TEXT NOT NULL,
      quantity  REAL,                 -- legacy (kept for migration; new rows leave it null)
      unit      TEXT,                 -- legacy
      raw_text  TEXT NOT NULL,
      confident INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (habit_id) REFERENCES habits(id)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_log_date ON entries(log_date);

    CREATE TABLE IF NOT EXISTS measures (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      kind     TEXT NOT NULL,         -- duration | pages | distance | sets | reps | weight | calories | count
      value    REAL NOT NULL,
      unit     TEXT,                  -- kg | min | km … (null for unit-less kinds)
      pos      INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_measures_entry ON measures(entry_id);

    CREATE TABLE IF NOT EXISTS goals (
      habit_id INTEGER PRIMARY KEY,
      type     TEXT NOT NULL,         -- 'count' (days/week) | 'quantity' (amount/week)
      target   REAL NOT NULL,
      unit     TEXT,
      FOREIGN KEY (habit_id) REFERENCES habits(id)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      label     TEXT NOT NULL,
      hour      INTEGER NOT NULL,
      minute    INTEGER NOT NULL,
      days      TEXT NOT NULL,
      enabled   INTEGER NOT NULL DEFAULT 1,
      notif_ids TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Goals gained a "metric" column (which measure an amount-goal tracks).
  ensureColumn('goals', 'metric', 'metric TEXT');
  // Habits gained a "category" column (the group they belong to).
  ensureColumn('habits', 'category', 'category TEXT');

  seedIfEmpty();
  migrateLegacyMeasures();
}

/** Add a column if the table doesn't already have it (SQLite has no IF NOT EXISTS for columns). */
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/** One-time: fold any old single quantity/unit entries into the measures table. */
function migrateLegacyMeasures() {
  if (getSetting('measures_migrated') === '1') return;
  const rows = db.getAllSync<{ id: number; quantity: number | null; unit: string | null }>(
    'SELECT id, quantity, unit FROM entries WHERE quantity IS NOT NULL'
  );
  for (const r of rows) {
    const existing = db.getFirstSync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM measures WHERE entry_id = ?',
      [r.id]
    );
    if ((existing?.c ?? 0) > 0) continue;
    if (typeof r.quantity !== 'number' || !Number.isFinite(r.quantity)) continue;
    db.runSync('INSERT INTO measures (entry_id, kind, value, unit, pos) VALUES (?, ?, ?, ?, 0)', [
      r.id,
      unitToKind(r.unit),
      r.quantity,
      r.unit ?? null,
    ]);
  }
  setSetting('measures_migrated', '1');
}

/* ------------------------------------------------------------------ */
/* Settings (simple key/value store)                                  */
/* ------------------------------------------------------------------ */
export function getSetting(key: string): string | null {
  const r = db.getFirstSync<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [
    key,
  ]);
  return r?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

/* ------------------------------------------------------------------ */
/* Date helper                                                       */
/* ------------------------------------------------------------------ */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/* Habits                                                            */
/* ------------------------------------------------------------------ */
export function getHabitNames(): string[] {
  return db
    .getAllSync<{ name: string }>('SELECT name FROM habits ORDER BY name ASC')
    .map((r) => r.name);
}

/**
 * Find or create a habit, optionally (re)assigning its category.
 * - category `undefined` → leave any existing category untouched.
 * - category `""`/whitespace → treated as null.
 * - category set → create with it, or update an existing habit to match.
 */
export function getOrCreateHabit(name: string, category?: string | null): number {
  const norm =
    category === undefined ? undefined : category && category.trim() ? category.trim() : null;
  const existing = db.getFirstSync<{ id: number; category: string | null }>(
    'SELECT id, category FROM habits WHERE name = ? COLLATE NOCASE',
    [name]
  );
  if (existing) {
    if (norm !== undefined && norm !== existing.category) {
      db.runSync('UPDATE habits SET category = ? WHERE id = ?', [norm, existing.id]);
    }
    return existing.id;
  }
  const res = db.runSync('INSERT INTO habits (name, category) VALUES (?, ?)', [
    name,
    norm ?? null,
  ]);
  return res.lastInsertRowId;
}

export function getOrCreateHabitId(name: string): number {
  return getOrCreateHabit(name);
}

/** Distinct category names currently in use (for quick-pick chips). */
export function getCategories(): string[] {
  return db
    .getAllSync<{ category: string }>(
      "SELECT DISTINCT category FROM habits WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC"
    )
    .map((r) => r.category);
}

/** Measure kinds previously logged for this habit, most-frequent first. */
export function getHabitMeasureKinds(name: string): string[] {
  const h = db.getFirstSync<{ id: number }>('SELECT id FROM habits WHERE name = ? COLLATE NOCASE', [
    name,
  ]);
  if (!h) return [];
  return db
    .getAllSync<{ kind: string }>(
      `SELECT m.kind AS kind, COUNT(*) AS c
         FROM measures m JOIN entries e ON e.id = m.entry_id
        WHERE e.habit_id = ?
        GROUP BY m.kind
        ORDER BY c DESC`,
      [h.id]
    )
    .map((r) => r.kind);
}

/* ------------------------------------------------------------------ */
/* Entries                                                           */
/* ------------------------------------------------------------------ */
function insertMeasures(entryId: number, measures: MeasureInput[] | undefined) {
  if (!measures) return;
  let pos = 0;
  for (const m of measures) {
    if (typeof m.value !== 'number' || !Number.isFinite(m.value)) continue;
    db.runSync('INSERT INTO measures (entry_id, kind, value, unit, pos) VALUES (?, ?, ?, ?, ?)', [
      entryId,
      m.kind,
      m.value,
      m.unit ?? null,
      pos++,
    ]);
  }
}

export function addEntry(e: NewEntry): number {
  const habitId = getOrCreateHabit(e.name, e.category);
  const res = db.runSync(
    `INSERT INTO entries (habit_id, log_date, raw_text, confident) VALUES (?, ?, ?, ?)`,
    [habitId, e.logDate, e.rawText, e.confident === false ? 0 : 1]
  );
  const id = res.lastInsertRowId;
  insertMeasures(id, e.measures);
  return id;
}

export function deleteEntry(id: number): void {
  db.runSync('DELETE FROM measures WHERE entry_id = ?', [id]);
  db.runSync('DELETE FROM entries WHERE id = ?', [id]);
}

export function updateEntry(
  id: number,
  e: { name: string; measures?: MeasureInput[]; category?: string | null }
): void {
  const habitId = getOrCreateHabit(e.name, e.category);
  db.runSync('UPDATE entries SET habit_id = ? WHERE id = ?', [habitId, id]);
  db.runSync('DELETE FROM measures WHERE entry_id = ?', [id]);
  insertMeasures(id, e.measures);
}

export function getEntriesForDate(date: string): EntryRow[] {
  const entries = db.getAllSync<Omit<EntryRow, 'measures'>>(
    `SELECT e.id, e.habit_id, h.name, h.category, e.log_date, e.raw_text, e.confident
       FROM entries e
       JOIN habits h ON h.id = e.habit_id
      WHERE e.log_date = ?
      ORDER BY e.id ASC`,
    [date]
  );
  if (entries.length === 0) return entries.map((e) => ({ ...e, measures: [] }));

  const ids = entries.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const measRows = db.getAllSync<{ entry_id: number; kind: string; value: number; unit: string | null }>(
    `SELECT entry_id, kind, value, unit FROM measures
      WHERE entry_id IN (${placeholders})
      ORDER BY entry_id, pos, id`,
    ids
  );
  const byEntry = new Map<number, Measure[]>();
  for (const m of measRows) {
    const arr = byEntry.get(m.entry_id) ?? [];
    arr.push({ kind: m.kind, value: m.value, unit: m.unit });
    byEntry.set(m.entry_id, arr);
  }
  return entries.map((e) => ({ ...e, measures: byEntry.get(e.id) ?? [] }));
}

/** Distinct dates (YYYY-MM-DD) that have at least one entry. */
export function getLoggedDates(): Set<string> {
  const rows = db.getAllSync<{ log_date: string }>('SELECT DISTINCT log_date FROM entries');
  return new Set(rows.map((r) => r.log_date));
}

/** Total number of entries whose log_date starts with `${year}-${month}`. */
export function getMonthEntryCount(yearMonthPrefix: string): number {
  const row = db.getFirstSync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM entries WHERE log_date LIKE ?',
    [yearMonthPrefix + '%']
  );
  return row?.c ?? 0;
}

/** Consecutive-day streak ending today (or yesterday if today is empty). */
export function getStreak(today: Date): number {
  const logged = getLoggedDates();
  const cursor = new Date(today);
  if (!logged.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (logged.has(toDateStr(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function clearAll() {
  db.execSync('DELETE FROM measures; DELETE FROM entries; DELETE FROM habits;');
}

/* ------------------------------------------------------------------ */
/* First-run seed (demo data so the screen looks alive)              */
/* ------------------------------------------------------------------ */
function seedIfEmpty() {
  const row = db.getFirstSync<{ c: number }>('SELECT COUNT(*) AS c FROM habits');
  if ((row?.c ?? 0) > 0) return;

  const today = new Date();
  const dayAgo = (n: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - n);
    return toDateStr(dt);
  };

  type SeedEntry = { name: string; category?: string; rawText: string; measures?: MeasureInput[] };
  const G = 'Gym';
  const S = 'Study';
  const plan: [number, SeedEntry[]][] = [
    [0, [
      { name: 'Reading', rawText: 'read my book for about two hours', measures: [{ kind: 'duration', value: 120, unit: 'min' }] },
      { name: 'Bench Press', category: G, rawText: 'bench press, 4 sets of 8 at 80 kilos', measures: [{ kind: 'sets', value: 4 }, { kind: 'reps', value: 8 }, { kind: 'weight', value: 80, unit: 'kg' }] },
      { name: 'Squat', category: G, rawText: 'squats, 5 by 5 at a hundred', measures: [{ kind: 'sets', value: 5 }, { kind: 'reps', value: 5 }, { kind: 'weight', value: 100, unit: 'kg' }] },
      { name: 'Treadmill', category: G, rawText: 'finished with 15 minutes on the treadmill', measures: [{ kind: 'duration', value: 15, unit: 'min' }] },
    ]],
    [1, [
      { name: 'Reading', rawText: 'read 25 pages before bed', measures: [{ kind: 'pages', value: 25 }] },
      { name: 'Calculus', category: S, rawText: 'calculus lecture and problem set', measures: [{ kind: 'duration', value: 45, unit: 'min' }] },
      { name: 'Physics', category: S, rawText: 'reviewed physics notes', measures: [{ kind: 'duration', value: 30, unit: 'min' }] },
    ]],
    [2, [
      { name: 'Bench Press', category: G, rawText: 'bench press 4 by 8 at 82.5', measures: [{ kind: 'sets', value: 4 }, { kind: 'reps', value: 8 }, { kind: 'weight', value: 82.5, unit: 'kg' }] },
      { name: 'Meditation', rawText: 'meditated in the morning', measures: [{ kind: 'duration', value: 10, unit: 'min' }] },
    ]],
    [3, [{ name: 'Reading', rawText: 'a chapter on habits', measures: [{ kind: 'pages', value: 18 }] }]],
    [5, [{ name: 'Running', rawText: 'easy jog', measures: [{ kind: 'distance', value: 3, unit: 'km' }] }]],
    [6, [
      { name: 'Squat', category: G, rawText: 'squats 5 by 5 at 102.5', measures: [{ kind: 'sets', value: 5 }, { kind: 'reps', value: 5 }, { kind: 'weight', value: 102.5, unit: 'kg' }] },
      { name: 'Reading', rawText: 'a few pages', measures: [{ kind: 'duration', value: 20, unit: 'min' }] },
    ]],
    [9, [{ name: 'Meditation', rawText: 'guided session', measures: [{ kind: 'duration', value: 15, unit: 'min' }] }]],
    [12, [{ name: 'Reading', rawText: 'finished a chapter', measures: [{ kind: 'duration', value: 50, unit: 'min' }] }]],
    [14, [{ name: 'Bench Press', category: G, rawText: 'bench 4 by 8 at 78', measures: [{ kind: 'sets', value: 4 }, { kind: 'reps', value: 8 }, { kind: 'weight', value: 78, unit: 'kg' }] }]],
  ];

  for (const [n, entries] of plan) {
    const logDate = dayAgo(n);
    for (const e of entries)
      addEntry({ name: e.name, category: e.category, rawText: e.rawText, logDate, measures: e.measures });
  }
}

/* ------------------------------------------------------------------ */
/* Goals (weekly targets per habit)                                   */
/* ------------------------------------------------------------------ */
export type GoalType = 'count' | 'quantity';
export type Goal = {
  habitId: number;
  type: GoalType;
  target: number;
  unit: string | null;
  metric: string | null; // which measure kind a 'quantity' goal tracks
};

export function getGoal(habitId: number): Goal | null {
  const r = db.getFirstSync<{
    habit_id: number;
    type: string;
    target: number;
    unit: string | null;
    metric: string | null;
  }>('SELECT habit_id, type, target, unit, metric FROM goals WHERE habit_id = ?', [habitId]);
  return r
    ? { habitId: r.habit_id, type: r.type as GoalType, target: r.target, unit: r.unit, metric: r.metric }
    : null;
}

export function setGoal(
  habitId: number,
  g: { type: GoalType; target: number; unit?: string | null; metric?: string | null }
): void {
  db.runSync(
    'INSERT OR REPLACE INTO goals (habit_id, type, target, unit, metric) VALUES (?, ?, ?, ?, ?)',
    [habitId, g.type, g.target, g.unit ?? null, g.metric ?? null]
  );
}

export function deleteGoal(habitId: number): void {
  db.runSync('DELETE FROM goals WHERE habit_id = ?', [habitId]);
}

/* ------------------------------------------------------------------ */
/* Per-habit progress stats                                           */
/* ------------------------------------------------------------------ */
export type MetricAgg = {
  kind: string;
  unit: string | null; // most-common unit logged for this metric
  count: number; // entries carrying this metric
  weekSum: number;
  weekMax: number;
  totalSum: number;
  best: number; // all-time max value
  last: number;
  lastDate: string;
};

export type HabitStat = {
  id: number;
  name: string;
  category: string | null;
  total: number; // all-time entries
  streak: number; // consecutive days ending today/yesterday
  weekDays: number; // distinct days logged this week (Sun→today)
  last7: boolean[]; // index 0 = 6 days ago … 6 = today
  goal: Goal | null;
  metrics: MetricAgg[]; // ordered by frequency
  primary: MetricAgg | null; // most-logged metric
};

export function getHabitStats(): HabitStat[] {
  const habits = db.getAllSync<{ id: number; name: string; category: string | null }>(
    'SELECT id, name, category FROM habits ORDER BY name ASC'
  );
  const entryRows = db.getAllSync<{ habit_id: number; log_date: string }>(
    'SELECT habit_id, log_date FROM entries'
  );
  const measRows = db.getAllSync<{
    habit_id: number;
    log_date: string;
    kind: string;
    value: number;
    unit: string | null;
  }>(
    `SELECT e.habit_id AS habit_id, e.log_date AS log_date, m.kind AS kind, m.value AS value, m.unit AS unit
       FROM measures m JOIN entries e ON e.id = m.entry_id`
  );

  const today = new Date();
  const todayStr = toDateStr(today);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = toDateStr(weekStart);

  const last7Dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    last7Dates.push(toDateStr(d));
  }

  // Dates + total entries per habit.
  const habitDates = new Map<number, Set<string>>();
  const habitTotal = new Map<number, number>();
  for (const r of entryRows) {
    let set = habitDates.get(r.habit_id);
    if (!set) {
      set = new Set();
      habitDates.set(r.habit_id, set);
    }
    set.add(r.log_date);
    habitTotal.set(r.habit_id, (habitTotal.get(r.habit_id) ?? 0) + 1);
  }

  // Measures per habit, grouped by kind.
  type MAcc = {
    unitCounts: Map<string, number>;
    count: number;
    weekSum: number;
    weekMax: number;
    totalSum: number;
    best: number;
    last: number;
    lastDate: string;
  };
  const habitMetrics = new Map<number, Map<string, MAcc>>();
  for (const r of measRows) {
    let mm = habitMetrics.get(r.habit_id);
    if (!mm) {
      mm = new Map();
      habitMetrics.set(r.habit_id, mm);
    }
    let a = mm.get(r.kind);
    if (!a) {
      a = { unitCounts: new Map(), count: 0, weekSum: 0, weekMax: 0, totalSum: 0, best: 0, last: 0, lastDate: '' };
      mm.set(r.kind, a);
    }
    a.count += 1;
    a.totalSum += r.value;
    if (r.value > a.best) a.best = r.value;
    if (r.unit) a.unitCounts.set(r.unit, (a.unitCounts.get(r.unit) ?? 0) + 1);
    if (r.log_date >= weekStartStr && r.log_date <= todayStr) {
      a.weekSum += r.value;
      if (r.value > a.weekMax) a.weekMax = r.value;
    }
    if (r.log_date >= a.lastDate) {
      a.lastDate = r.log_date;
      a.last = r.value;
    }
  }

  return habits.map((h) => {
    const dates = habitDates.get(h.id) ?? new Set<string>();

    // streak (today, or yesterday if today empty)
    const cursor = new Date(today);
    if (!dates.has(toDateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (dates.has(toDateStr(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    let weekDays = 0;
    dates.forEach((ds) => {
      if (ds >= weekStartStr && ds <= todayStr) weekDays += 1;
    });

    const mm = habitMetrics.get(h.id);
    const metrics: MetricAgg[] = mm
      ? Array.from(mm.entries())
          .map(([kind, a]) => {
            let unit: string | null = null;
            let best = 0;
            a.unitCounts.forEach((c, u) => {
              if (c > best) {
                best = c;
                unit = u;
              }
            });
            return {
              kind,
              unit,
              count: a.count,
              weekSum: a.weekSum,
              weekMax: a.weekMax,
              totalSum: a.totalSum,
              best: a.best,
              last: a.last,
              lastDate: a.lastDate,
            };
          })
          .sort((x, y) => y.count - x.count)
      : [];

    return {
      id: h.id,
      name: h.name,
      category: h.category,
      total: habitTotal.get(h.id) ?? 0,
      streak,
      weekDays,
      last7: last7Dates.map((ds) => dates.has(ds)),
      goal: getGoal(h.id),
      metrics,
      primary: metrics[0] ?? null,
    };
  });
}

/** Weekly progress toward a goal: current value + target. */
export function goalProgress(stat: HabitStat): { current: number; target: number; pct: number } {
  const goal = stat.goal;
  if (!goal) return { current: 0, target: 0, pct: 0 };
  if (goal.type === 'count') {
    const target = goal.target || 1;
    return { current: stat.weekDays, target: goal.target, pct: stat.weekDays / target };
  }
  const kind = goal.metric ?? stat.primary?.kind ?? null;
  const m = kind ? stat.metrics.find((x) => x.kind === kind) : null;
  const current = m ? (metricDef(m.kind).agg === 'max' ? m.weekMax : m.weekSum) : 0;
  const target = goal.target || 1;
  return { current, target: goal.target, pct: current / target };
}

/* ------------------------------------------------------------------ */
/* Reminders                                                          */
/* ------------------------------------------------------------------ */
export type Reminder = {
  id: number;
  label: string;
  hour: number;
  minute: number;
  days: number[]; // 0-6, 0=Sun
  enabled: boolean;
  notifIds: string[];
};

type ReminderRow = {
  id: number;
  label: string;
  hour: number;
  minute: number;
  days: string;
  enabled: number;
  notif_ids: string | null;
};

function parseReminderRow(r: ReminderRow): Reminder {
  return {
    id: r.id,
    label: r.label,
    hour: r.hour,
    minute: r.minute,
    days: String(r.days)
      .split(',')
      .filter((s) => s !== '')
      .map(Number),
    enabled: r.enabled === 1,
    notifIds: r.notif_ids ? (JSON.parse(r.notif_ids) as string[]) : [],
  };
}

export function getReminders(): Reminder[] {
  return db
    .getAllSync<ReminderRow>('SELECT * FROM reminders ORDER BY hour, minute')
    .map(parseReminderRow);
}

export function addReminder(r: {
  label: string;
  hour: number;
  minute: number;
  days: number[];
  enabled?: boolean;
}): number {
  const res = db.runSync(
    'INSERT INTO reminders (label, hour, minute, days, enabled, notif_ids) VALUES (?, ?, ?, ?, ?, ?)',
    [r.label, r.hour, r.minute, r.days.join(','), r.enabled === false ? 0 : 1, '[]']
  );
  return res.lastInsertRowId;
}

export function updateReminder(
  id: number,
  r: { label: string; hour: number; minute: number; days: number[] }
): void {
  db.runSync('UPDATE reminders SET label = ?, hour = ?, minute = ?, days = ? WHERE id = ?', [
    r.label,
    r.hour,
    r.minute,
    r.days.join(','),
    id,
  ]);
}

export function setReminderEnabled(id: number, enabled: boolean): void {
  db.runSync('UPDATE reminders SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

export function setReminderNotifIds(id: number, ids: string[]): void {
  db.runSync('UPDATE reminders SET notif_ids = ? WHERE id = ?', [JSON.stringify(ids), id]);
}

export function deleteReminder(id: number): void {
  db.runSync('DELETE FROM reminders WHERE id = ?', [id]);
}

// Ensure schema + seed exist before any query runs (child effects fire before
// parent effects, so we can't rely on a layout-level init).
initDb();

export default db;
