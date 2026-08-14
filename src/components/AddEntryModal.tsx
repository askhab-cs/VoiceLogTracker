import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getHabitMeasureKinds, type Measure } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { metricDef, METRIC_ORDER, metricName } from '@/lib/metrics';
import { useKeyboardHeight } from '@/lib/useKeyboard';

const C = {
  card: '#FFFFFF',
  text: '#18181B',
  muted: '#A1A1AA',
  faint: '#C7C7CC',
  hairline: '#ECECEF',
  field: '#F4F4F5',
  chipBg: '#F4F4F5',
  chipActive: '#18181B',
  accent: '#18181B',
  danger: '#EF4444',
  overlay: 'rgba(0,0,0,0.35)',
};

export type MeasureDraft = { kind: string; value: number; unit: string | null };
export type ManualEntry = { name: string; category: string | null; measures: MeasureDraft[] };

type Row = { kind: string; value: string; unit: string | null };

const SCREEN_H = Dimensions.get('window').height;

/**
 * Bottom-sheet form for adding / editing a log entry by hand.
 * - Tap an existing habit chip to fill the name.
 * - Add as many measurements as you like (reps, weight, minutes, pages…).
 */
export default function AddEntryModal({
  visible,
  dateLabel,
  suggestions,
  categories,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  dateLabel: string;
  suggestions: string[];
  categories: string[];
  initial?: { name: string; category: string | null; measures: Measure[] } | null;
  onClose: () => void;
  onSave: (e: ManualEntry) => void;
}) {
  const { t } = useI18n();
  const kb = useKeyboardHeight();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setCategory(initial?.category ?? '');
      setRows(
        (initial?.measures ?? []).map((m) => ({
          kind: m.kind,
          value: String(m.value),
          unit: m.unit,
        }))
      );
    }
  }, [visible, initial]);

  const isEditing = !!initial;
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0;

  // Which detail chips to offer: kinds already used for this habit first, then the rest.
  const present = new Set(rows.map((r) => r.kind));
  const addable = useMemo(() => {
    const history = trimmedName ? getHabitMeasureKinds(trimmedName) : [];
    const ordered = [...history, ...METRIC_ORDER.filter((k) => !history.includes(k))];
    return ordered.filter((k) => !present.has(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedName, rows.length]);

  function addRow(kind: string) {
    const def = metricDef(kind);
    setRows((r) => [...r, { kind, value: '', unit: def.defaultUnit }]);
  }

  function setRowValue(i: number, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, value } : row)));
  }

  function cycleUnit(i: number) {
    setRows((r) =>
      r.map((row, idx) => {
        if (idx !== i) return row;
        const units = metricDef(row.kind).units;
        if (units.length < 2) return row;
        const cur = units.indexOf(row.unit ?? units[0]);
        return { ...row, unit: units[(cur + 1) % units.length] };
      })
    );
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    if (!canSave) return;
    const measures: MeasureDraft[] = rows
      .map((r) => ({
        kind: r.kind,
        value: parseFloat(r.value.replace(',', '.')),
        unit: r.unit,
      }))
      .filter((m) => Number.isFinite(m.value));
    onSave({ name: trimmedName, category: category.trim() || null, measures });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: kb > 0 ? kb + 12 : 34 }]}>
          <View style={styles.grabber} />

          <ScrollView
            style={{ maxHeight: SCREEN_H * 0.6 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{isEditing ? t('editEntryTitle') : t('addEntryTitle')}</Text>
              <Text style={styles.dateLabel}>{dateLabel}</Text>
            </View>

            {/* Category */}
            <Text style={styles.label}>{t('categoryLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('categoryPlaceholder')}
              placeholderTextColor={C.faint}
              value={category}
              onChangeText={setCategory}
              returnKeyType="done"
            />
            {categories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chips}>
                {categories.map((c) => {
                  const active = c.toLowerCase() === category.trim().toLowerCase();
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(active ? '' : c)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Name */}
            <Text style={styles.label}>{t('activity')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('activityPlaceholder')}
              placeholderTextColor={C.faint}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
            />

            {suggestions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chips}>
                {suggestions.map((s) => {
                  const active = s.toLowerCase() === trimmedName.toLowerCase();
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setName(s)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Details / measures */}
            <Text style={styles.label}>{t('detailsLabel')}</Text>
            {rows.length === 0 && <Text style={styles.detailsHint}>{t('detailsHint')}</Text>}

            {rows.map((row, i) => {
              const def = metricDef(row.kind);
              return (
                <View key={`${row.kind}-${i}`} style={styles.mRow}>
                  <Text style={styles.mLabel} numberOfLines={1}>
                    {metricName(row.kind, t)}
                  </Text>
                  <TextInput
                    style={styles.mValue}
                    placeholder={t('valuePlaceholder')}
                    placeholderTextColor={C.faint}
                    value={row.value}
                    onChangeText={(v) => setRowValue(i, v)}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                  {def.hasUnit ? (
                    def.units.length > 1 ? (
                      <Pressable onPress={() => cycleUnit(i)} style={styles.unitToggle}>
                        <Text style={styles.unitToggleText}>{row.unit ?? def.defaultUnit}</Text>
                        <Ionicons name="swap-horizontal" size={12} color={C.muted} />
                      </Pressable>
                    ) : (
                      <View style={styles.unitStatic}>
                        <Text style={styles.unitStaticText}>{row.unit ?? def.defaultUnit}</Text>
                      </View>
                    )
                  ) : (
                    <View style={styles.unitSpacer} />
                  )}
                  <Pressable onPress={() => removeRow(i)} style={styles.removeBtn} hitSlop={8}>
                    <Ionicons name="close" size={16} color={C.muted} />
                  </Pressable>
                </View>
              );
            })}

            {/* Add-detail chips */}
            {addable.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chips}>
                {addable.map((k) => (
                  <Pressable key={k} onPress={() => addRow(k)} style={styles.addChip}>
                    <Ionicons name="add" size={14} color={C.text} />
                    <Text style={styles.addChipText}>{metricName(k, t)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
              <Text style={styles.btnGhostText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                !canSave && styles.btnDisabled,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>{isEditing ? t('save') : t('add')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: C.overlay },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.hairline,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  dateLabel: { fontSize: 13, color: C.muted },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 12, marginBottom: 4 },
  detailsHint: { fontSize: 12, color: C.faint, marginBottom: 4 },
  input: {
    backgroundColor: C.field,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: C.text,
  },
  chips: { gap: 8, paddingVertical: 8, paddingRight: 8 },
  chip: { backgroundColor: C.chipBg, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: C.chipActive },
  chipText: { fontSize: 14, fontWeight: '600', color: C.text },
  chipTextActive: { color: '#FFFFFF' },

  mRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  mLabel: { width: 78, fontSize: 14, fontWeight: '600', color: C.text },
  mValue: {
    flex: 1,
    backgroundColor: C.field,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: C.text,
  },
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.field,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minWidth: 52,
    justifyContent: 'center',
  },
  unitToggleText: { fontSize: 14, fontWeight: '600', color: C.text },
  unitStatic: {
    backgroundColor: C.field,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minWidth: 52,
    alignItems: 'center',
  },
  unitStaticText: { fontSize: 14, fontWeight: '600', color: C.muted },
  unitSpacer: { width: 0 },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.field,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
  },
  addChipText: { fontSize: 13, fontWeight: '600', color: C.text },

  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnGhost: { backgroundColor: C.field },
  btnGhostText: { fontSize: 16, fontWeight: '600', color: C.text },
  btnPrimary: { backgroundColor: C.accent },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  btnDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
