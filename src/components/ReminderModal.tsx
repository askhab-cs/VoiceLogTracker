import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useI18n, weekdayLabels } from '@/lib/i18n';

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

export type ReminderDraft = { label: string; hour: number; minute: number; days: number[] };

function to12(h: number) {
  const meridiem = h >= 12 ? 'PM' : 'AM';
  let hr = h % 12;
  if (hr === 0) hr = 12;
  return { hr, meridiem };
}

function Stepper({
  onDown,
  onUp,
  children,
}: {
  onDown: () => void;
  onUp: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDown} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <Ionicons name="chevron-down" size={18} color={C.text} />
      </Pressable>
      <View style={styles.stepValue}>{children}</View>
      <Pressable onPress={onUp} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <Ionicons name="chevron-up" size={18} color={C.text} />
      </Pressable>
    </View>
  );
}

/** Bottom sheet to create / edit / delete a reminder. */
export default function ReminderModal({
  visible,
  initial,
  suggestions,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  initial?: ReminderDraft | null;
  suggestions: string[];
  onClose: () => void;
  onSave: (r: ReminderDraft) => void;
  onDelete?: () => void;
}) {
  const { t, locale } = useI18n();
  const dayLetters = weekdayLabels(locale, 'narrow');
  const [label, setLabel] = useState('');
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (visible) {
      setLabel(initial?.label ?? '');
      setHour(initial?.hour ?? 20);
      setMinute(initial?.minute ?? 0);
      setDays(initial?.days ?? [1, 2, 3, 4, 5]);
    }
  }, [visible, initial]);

  const isEditing = !!initial;
  const trimmed = label.trim();
  const canSave = trimmed.length > 0 && days.length > 0;
  const { hr, meridiem } = to12(hour);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function save() {
    if (!canSave) return;
    onSave({ label: trimmed, hour, minute, days: [...days].sort((a, b) => a - b) });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{isEditing ? t('editReminder') : t('newReminder')}</Text>

          {/* Label */}
          <Text style={styles.label}>{t('remindMeTo')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('reminderPlaceholder')}
            placeholderTextColor={C.faint}
            value={label}
            onChangeText={setLabel}
            returnKeyType="done"
          />
          {suggestions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {suggestions.map((s) => (
                <Pressable key={s} onPress={() => setLabel(s)} style={styles.chip}>
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Time */}
          <Text style={styles.label}>{t('time')}</Text>
          <View style={styles.timeRow}>
            <Stepper onDown={() => setHour((h) => (h + 23) % 24)} onUp={() => setHour((h) => (h + 1) % 24)}>
              <Text style={styles.timeBig}>{hr}</Text>
            </Stepper>
            <Text style={styles.colon}>:</Text>
            <Stepper
              onDown={() => setMinute((m) => (m + 55) % 60)}
              onUp={() => setMinute((m) => (m + 5) % 60)}>
              <Text style={styles.timeBig}>{String(minute).padStart(2, '0')}</Text>
            </Stepper>
            <Pressable
              onPress={() => setHour((h) => (h + 12) % 24)}
              style={({ pressed }) => [styles.meridiem, pressed && styles.pressed]}>
              <Text style={styles.meridiemText}>{meridiem}</Text>
            </Pressable>
          </View>

          {/* Day presets */}
          <View style={styles.presets}>
            <Pressable onPress={() => setDays([0, 1, 2, 3, 4, 5, 6])} style={styles.preset}>
              <Text style={styles.presetText}>{t('everyDay')}</Text>
            </Pressable>
            <Pressable onPress={() => setDays([1, 2, 3, 4, 5])} style={styles.preset}>
              <Text style={styles.presetText}>{t('weekdaysLabel')}</Text>
            </Pressable>
            <Pressable onPress={() => setDays([0, 6])} style={styles.preset}>
              <Text style={styles.presetText}>{t('weekendsLabel')}</Text>
            </Pressable>
          </View>

          {/* Day chips */}
          <View style={styles.dayRow}>
            {dayLetters.map((d, i) => {
              const on = days.includes(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleDay(i)}
                  style={[styles.dayChip, on && styles.dayChipOn]}>
                  <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {isEditing && onDelete ? (
              <Pressable
                onPress={onDelete}
                style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.pressed]}>
                <Ionicons name="trash-outline" size={17} color={C.danger} />
                <Text style={styles.btnDangerText}>{t('delete')}</Text>
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
              <Text style={styles.btnPrimaryText}>{isEditing ? t('save') : t('add')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    paddingBottom: 34,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.hairline,
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.text },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 16, marginBottom: 4 },
  input: {
    backgroundColor: C.field,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: C.text,
  },
  chips: { gap: 8, paddingVertical: 8, paddingRight: 8 },
  chip: { backgroundColor: C.field, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 14, fontWeight: '600', color: C.text },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  stepper: { alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 56,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.field,
    borderRadius: 8,
  },
  stepValue: { paddingVertical: 4 },
  timeBig: { fontSize: 34, fontWeight: '800', color: C.text, fontVariant: ['tabular-nums'] },
  colon: { fontSize: 34, fontWeight: '800', color: C.text, marginHorizontal: 2 },
  meridiem: {
    marginLeft: 10,
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  meridiemText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  presets: { flexDirection: 'row', gap: 8, marginTop: 18 },
  preset: { flex: 1, alignItems: 'center', backgroundColor: C.field, borderRadius: 10, paddingVertical: 9 },
  presetText: { fontSize: 12, fontWeight: '600', color: C.text },

  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.field,
  },
  dayChipOn: { backgroundColor: C.accent },
  dayChipText: { fontSize: 14, fontWeight: '700', color: C.muted },
  dayChipTextOn: { color: '#FFFFFF' },

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
  pressed: { opacity: 0.6 },
});
