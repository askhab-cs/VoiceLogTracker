import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Goal, GoalType } from '@/lib/db';
import { useI18n } from '@/lib/i18n';
import { metricDef, metricName, unitLabel } from '@/lib/metrics';
import { useKeyboardHeight } from '@/lib/useKeyboard';

const C = {
  card: '#FFFFFF',
  text: '#18181B',
  muted: '#A1A1AA',
  faint: '#C7C7CC',
  hairline: '#ECECEF',
  field: '#F4F4F5',
  accent: '#18181B',
  danger: '#EF4444',
  overlay: 'rgba(0,0,0,0.35)',
};

export type GoalDraft = {
  type: GoalType;
  target: number;
  unit: string | null;
  metric: string | null;
};

/** Bottom sheet to set / edit / remove a habit's weekly goal. */
export default function GoalModal({
  visible,
  habitName,
  initial,
  metricKind,
  metricUnit,
  metricLabel,
  metricHasUnit,
  metricAvailable,
  onClose,
  onSave,
}: {
  visible: boolean;
  habitName: string;
  initial: Goal | null;
  metricKind: string | null;
  metricUnit: string | null;
  metricLabel: string;
  metricHasUnit: boolean;
  metricAvailable: boolean;
  onClose: () => void;
  onSave: (g: GoalDraft | null) => void;
}) {
  const { t } = useI18n();
  const kb = useKeyboardHeight();

  // Resolve which metric an amount-goal would track (current data, or the
  // existing goal's metric when editing a habit that has no fresh data).
  const effKind = metricKind ?? initial?.metric ?? null;
  const amountEnabled = metricAvailable || initial?.type === 'quantity';
  const effHasUnit = effKind ? metricDef(effKind).hasUnit : metricHasUnit;
  const effUnit = metricUnit ?? initial?.unit ?? (effKind ? metricDef(effKind).defaultUnit : null);
  const effLabel = effKind ? metricName(effKind, t) : metricLabel;

  const [type, setType] = useState<GoalType>('count');
  const [target, setTarget] = useState('');

  useEffect(() => {
    if (visible) {
      const initType = initial?.type ?? 'count';
      setType(initType === 'quantity' && !amountEnabled ? 'count' : initType);
      setTarget(initial?.target != null ? String(initial.target) : '');
    }
  }, [visible, initial, amountEnabled]);

  const targetNum = parseFloat(target.replace(',', '.'));
  const canSave = Number.isFinite(targetNum) && targetNum > 0;

  const suffixText =
    type === 'count' ? t('daysPerWeekSuffix') : effHasUnit ? unitLabel(effUnit, t) : effLabel;

  function save() {
    if (!canSave) return;
    if (type === 'count') {
      onSave({ type: 'count', target: targetNum, unit: null, metric: null });
    } else {
      onSave({ type: 'quantity', target: targetNum, unit: effUnit, metric: effKind });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: kb > 0 ? kb + 12 : 34 }]}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('weeklyGoal')}</Text>
            <Text style={styles.habit}>{habitName}</Text>
          </View>

          {/* Goal type segmented control */}
          <View style={styles.segment}>
            <Pressable
              onPress={() => setType('count')}
              style={[styles.segBtn, type === 'count' && styles.segBtnActive]}>
              <Text style={[styles.segText, type === 'count' && styles.segTextActive]}>
                {t('daysPerWeek')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => amountEnabled && setType('quantity')}
              disabled={!amountEnabled}
              style={[styles.segBtn, type === 'quantity' && styles.segBtnActive]}>
              <Text
                style={[
                  styles.segText,
                  type === 'quantity' && styles.segTextActive,
                  !amountEnabled && styles.segTextDisabled,
                ]}>
                {t('amountPerWeek')}
              </Text>
            </Pressable>
          </View>

          {!amountEnabled && <Text style={styles.note}>{t('goalNoMetric')}</Text>}
          {type === 'quantity' && amountEnabled && (
            <Text style={styles.note}>{t('goalMetricHint', { metric: effLabel })}</Text>
          )}

          {/* Target */}
          <Text style={styles.label}>
            {type === 'count' ? t('targetDays') : t('targetAmount')}
          </Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.target]}
              placeholder={type === 'count' ? '5' : '150'}
              placeholderTextColor={C.faint}
              value={target}
              onChangeText={setTarget}
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"
            />
            <View style={[styles.input, styles.suffix]}>
              <Text style={styles.suffixText} numberOfLines={1}>
                {suffixText}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {initial ? (
              <Pressable
                onPress={() => onSave(null)}
                style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.pressed]}>
                <Ionicons name="trash-outline" size={17} color={C.danger} />
                <Text style={styles.btnDangerText}>{t('remove')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
                <Text style={styles.btnGhostText}>{t('cancel')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={save}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                !canSave && styles.btnDisabled,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>{t('saveGoal')}</Text>
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
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  habit: { fontSize: 14, fontWeight: '600', color: C.muted },
  segment: { flexDirection: 'row', backgroundColor: C.field, borderRadius: 12, padding: 4, marginTop: 16 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segBtnActive: { backgroundColor: C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '600', color: C.muted },
  segTextActive: { color: C.text },
  segTextDisabled: { color: C.faint },
  note: { fontSize: 12, color: C.muted, marginTop: 10 },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    backgroundColor: C.field,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: C.text,
  },
  target: { flex: 1 },
  suffix: { flex: 2, justifyContent: 'center' },
  suffixText: { fontSize: 15, color: C.muted },
  actions: { flexDirection: 'row', gap: 12, marginTop: 22 },
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
  btnDanger: { backgroundColor: '#FEF2F2' },
  btnDangerText: { fontSize: 16, fontWeight: '700', color: C.danger },
  btnPrimary: { backgroundColor: C.accent },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  btnDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
