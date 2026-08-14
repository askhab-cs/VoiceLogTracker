import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GoalModal, { GoalDraft } from '@/components/GoalModal';
import { deleteGoal, getHabitStats, goalProgress, HabitStat, MetricAgg, setGoal } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { fmtNum, formatMeasure, metricDef, metricName, unitLabel } from '@/lib/metrics';

const C = {
  bg: '#F2F2F5',
  card: '#FFFFFF',
  text: '#18181B',
  muted: '#A1A1AA',
  faint: '#C7C7CC',
  hairline: '#ECECEF',
  track: '#ECECEF',
  fill: '#18181B',
  dot: '#373737',
  dotEmpty: '#E4E4E7',
  flame: '#F97316',
  field: '#F7F7F8',
};

function last7Letters(locale: string): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(d.toLocaleDateString(locale, { weekday: 'narrow' }));
  }
  return out;
}

/** Group habit stats by category — categorized sections first, "Other" last. */
function groupStats(stats: HabitStat[]): { category: string | null; items: HabitStat[] }[] {
  const groups: { category: string | null; items: HabitStat[] }[] = [];
  const idx = new Map<string, number>();
  for (const s of stats) {
    const key = s.category ?? ' ';
    let gi = idx.get(key);
    if (gi === undefined) {
      gi = groups.length;
      idx.set(key, gi);
      groups.push({ category: s.category ?? null, items: [] });
    }
    groups[gi].items.push(s);
  }
  return [...groups.filter((g) => g.category != null), ...groups.filter((g) => g.category == null)];
}

/** Pick the metric an "amount / week" goal should track (first additive one). */
function additiveMetric(s: HabitStat): MetricAgg | null {
  return s.metrics.find((m) => metricDef(m.kind).agg === 'sum') ?? null;
}

function ProgressBar({ pct }: { pct: number }) {
  const w = Math.min(100, Math.max(0, pct * 100));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${w}%` }]} />
    </View>
  );
}

export default function ProgressScreen() {
  const { t, locale } = useI18n();
  const letters = last7Letters(locale);

  const [stats, setStats] = useState<HabitStat[]>(() => getHabitStats());
  const [modalVisible, setModalVisible] = useState(false);
  const [selected, setSelected] = useState<HabitStat | null>(null);

  const refresh = useCallback(() => setStats(getHabitStats()), []);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  function openGoal(stat: HabitStat) {
    setSelected(stat);
    setModalVisible(true);
  }

  function handleGoalSave(draft: GoalDraft | null) {
    if (selected) {
      if (draft === null) deleteGoal(selected.id);
      else setGoal(selected.id, draft);
    }
    setModalVisible(false);
    setSelected(null);
    refresh();
  }

  const selectedAdditive = selected ? additiveMetric(selected) : null;

  function renderCard(s: HabitStat) {
    const goal = s.goal;
    const prog = goalProgress(s);
    const goalKind = goal?.metric ?? s.primary?.kind ?? null;
    const goalDef = goalKind ? metricDef(goalKind) : null;
    const unitText = goalDef
      ? goalDef.hasUnit
        ? unitLabel(goal?.unit ?? goalDef.defaultUnit, t)
        : metricName(goalKind!, t)
      : '';
    return (
      <View key={s.id} style={styles.card}>
        <Pressable
          onPress={() => openGoal(s)}
          style={({ pressed }) => [styles.titleRow, pressed && styles.pressed]}>
          <Text style={styles.name}>{s.name}</Text>
          {goal ? (
            <View style={styles.pct}>
              <Text style={styles.pctText}>{Math.round(prog.pct * 100)}%</Text>
            </View>
          ) : (
            <View style={styles.setGoal}>
              <Ionicons name="flag-outline" size={13} color={C.muted} />
              <Text style={styles.setGoalText}>{t('setGoal')}</Text>
            </View>
          )}
        </Pressable>

        {goal && (
          <View style={styles.goalBlock}>
            <ProgressBar pct={prog.pct} />
            <Text style={styles.goalLabel}>
              {goal.type === 'count'
                ? t('daysThisWeek', { a: s.weekDays, b: fmtNum(goal.target) })
                : t('amountThisWeek', {
                    a: fmtNum(prog.current),
                    b: fmtNum(goal.target),
                    unit: unitText,
                  })}
            </Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <View style={styles.statValueRow}>
              <Ionicons name="flame" size={14} color={C.flame} />
              <Text style={styles.statValue}>{s.streak}</Text>
            </View>
            <Text style={styles.statLabel}>{t('dayStreak')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{s.weekDays}</Text>
            <Text style={styles.statLabel}>{t('thisWeek')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{s.total}</Text>
            <Text style={styles.statLabel}>{t('totalLogs')}</Text>
          </View>
        </View>

        {s.metrics.length > 0 && (
          <View style={styles.metricsBlock}>
            {s.metrics.slice(0, 4).map((m, i, arr) => {
              const def = metricDef(m.kind);
              const isMax = def.agg === 'max';
              const valNum = isMax ? m.best : m.weekSum;
              const display = formatMeasure({ kind: m.kind, value: valNum, unit: m.unit }, t);
              return (
                <View
                  key={m.kind}
                  style={[styles.metricRow, i === arr.length - 1 && styles.metricRowLast]}>
                  <Ionicons name={def.icon as any} size={15} color={C.muted} />
                  <Text style={styles.metricName}>{metricName(m.kind, t)}</Text>
                  <Text style={styles.metricValue}>{display}</Text>
                  <Text style={styles.metricCaption}>
                    {isMax ? t('allTimeBest') : t('thisWeekShort')}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.weekRow}>
          {s.last7.map((on, i) => (
            <View key={i} style={styles.weekCell}>
              <View style={[styles.weekBar, on ? styles.weekBarOn : styles.weekBarOff]} />
              <Text style={styles.weekLetter}>{letters[i]}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const groups = groupStats(stats);
  const hasCategories = groups.some((g) => g.category != null);

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.h1}>{t('progressTitle')}</Text>
          <Text style={styles.h2}>{t('progressSubtitle')}</Text>
        </View>

        {stats.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>{t('noHabits')}</Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.category ?? '__other__'} style={styles.section}>
              {hasCategories && (
                <Text style={styles.sectionHeader}>{g.category ?? t('otherCategory')}</Text>
              )}
              {g.items.map((s) => renderCard(s))}
            </View>
          ))
        )}

        <Text style={styles.footHint}>{t('progressFootHint')}</Text>
      </ScrollView>

      <GoalModal
        visible={modalVisible}
        habitName={selected?.name ?? ''}
        initial={selected?.goal ?? null}
        metricLabel={selectedAdditive ? metricName(selectedAdditive.kind, t) : ''}
        metricKind={selectedAdditive?.kind ?? null}
        metricUnit={
          selectedAdditive
            ? selectedAdditive.unit || metricDef(selectedAdditive.kind).defaultUnit
            : null
        }
        metricHasUnit={selectedAdditive ? metricDef(selectedAdditive.kind).hasUnit : false}
        metricAvailable={!!selectedAdditive}
        onClose={() => {
          setModalVisible(false);
          setSelected(null);
        }}
        onSave={handleGoalSave}
      />
    </SafeAreaView>
  );
}

const card = {
  backgroundColor: C.card,
  borderRadius: 20,
  padding: 16,
  shadowColor: '#18181B',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8, gap: 14 },
  headerBlock: { paddingVertical: 6 },
  h1: { fontSize: 28, fontWeight: '800', color: C.text },
  h2: { fontSize: 14, color: C.muted, marginTop: 2 },

  section: { gap: 14 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginLeft: 4,
    marginBottom: -2,
  },

  card,
  empty: { fontSize: 14, color: C.muted, paddingVertical: 8, lineHeight: 20 },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 18, fontWeight: '700', color: C.text },
  pct: { backgroundColor: '#F4F4F5', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pctText: { fontSize: 13, fontWeight: '700', color: C.text },
  setGoal: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  setGoalText: { fontSize: 13, fontWeight: '600', color: C.muted },

  goalBlock: { marginTop: 12, gap: 6 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: C.track, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.fill },
  goalLabel: { fontSize: 12, color: C.muted },

  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 11, color: C.muted },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: C.hairline },

  metricsBlock: {
    marginTop: 14,
    backgroundColor: C.field,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairline,
  },
  metricRowLast: { borderBottomWidth: 0 },
  metricName: { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  metricValue: { fontSize: 14, fontWeight: '700', color: C.text },
  metricCaption: { fontSize: 10, color: C.faint, width: 58, textAlign: 'right' },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  weekCell: { flex: 1, alignItems: 'center', gap: 5 },
  weekBar: { width: 18, height: 18, borderRadius: 6 },
  weekBarOn: { backgroundColor: C.dot },
  weekBarOff: { backgroundColor: C.dotEmpty },
  weekLetter: { fontSize: 10, color: C.faint, fontWeight: '600' },

  footHint: { fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 4 },
  pressed: { opacity: 0.6 },
});
