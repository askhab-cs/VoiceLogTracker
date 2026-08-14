import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ReminderModal, { ReminderDraft } from '@/components/ReminderModal';
import {
  addReminder,
  deleteReminder,
  getHabitNames,
  getReminders,
  Reminder,
  setReminderEnabled,
  updateReminder,
} from '@/lib/db';
import { useI18n, weekdayLabels } from '@/lib/i18n';
import { applyReminder, cancelNotifIds, ensureNotificationPermission } from '@/lib/reminders';

const C = {
  bg: '#F2F2F5',
  card: '#FFFFFF',
  text: '#18181B',
  muted: '#A1A1AA',
  faint: '#C7C7CC',
  hairline: '#ECECEF',
  accent: '#18181B',
};

function formatTime(hour: number, minute: number): string {
  const m = hour >= 12 ? 'PM' : 'AM';
  let hr = hour % 12;
  if (hr === 0) hr = 12;
  return `${hr}:${String(minute).padStart(2, '0')} ${m}`;
}

export default function RemindersScreen() {
  const { t, locale } = useI18n();
  const shortNames = weekdayLabels(locale, 'short');

  const [reminders, setReminders] = useState<Reminder[]>(() => getReminders());
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);

  const refresh = useCallback(() => setReminders(getReminders()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function daysSummary(days: number[]): string {
    const s = [...days].sort((a, b) => a - b);
    const eq = (a: number[]) => a.length === s.length && a.every((v, i) => v === s[i]);
    if (eq([0, 1, 2, 3, 4, 5, 6])) return t('everyDay');
    if (eq([1, 2, 3, 4, 5])) return t('weekdaysLabel');
    if (eq([0, 6])) return t('weekendsLabel');
    return s.map((d) => shortNames[d]).join(', ');
  }

  function openNew() {
    setEditing(null);
    setModalVisible(true);
  }

  function openEdit(r: Reminder) {
    setEditing(r);
    setModalVisible(true);
  }

  async function handleSave(draft: ReminderDraft) {
    const id = editing ? (updateReminder(editing.id, draft), editing.id) : addReminder({ ...draft });
    setModalVisible(false);
    setEditing(null);
    refresh();

    const saved = getReminders().find((x) => x.id === id);
    if (!saved) return;
    if (saved.enabled) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(t('notifOffTitle'), t('notifOffBodySave'));
        return;
      }
    }
    await applyReminder(saved);
  }

  async function handleDelete() {
    if (!editing) return;
    await cancelNotifIds(editing.notifIds);
    deleteReminder(editing.id);
    setModalVisible(false);
    setEditing(null);
    refresh();
  }

  async function toggle(r: Reminder, value: boolean) {
    setReminderEnabled(r.id, value);
    refresh();
    if (value) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        Alert.alert(t('notifOffTitle'), t('notifOffBodyToggle'));
        return;
      }
    }
    const updated = getReminders().find((x) => x.id === r.id);
    if (updated) await applyReminder(updated);
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.h1}>{t('remindersTitle')}</Text>
          <Text style={styles.h2}>{t('remindersSubtitle')}</Text>
        </View>

        {reminders.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>{t('noReminders')}</Text>
          </View>
        ) : (
          reminders.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => openEdit(r)}
              style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]}>
              <View style={styles.rowLeft}>
                <Text style={[styles.time, !r.enabled && styles.dim]}>
                  {formatTime(r.hour, r.minute)}
                </Text>
                <Text style={[styles.label, !r.enabled && styles.dim]} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text style={styles.days}>{daysSummary(r.days)}</Text>
              </View>
              <Switch
                value={r.enabled}
                onValueChange={(v) => toggle(r, v)}
                trackColor={{ true: C.accent, false: '#D4D4D8' }}
                thumbColor="#FFFFFF"
              />
            </Pressable>
          ))
        )}

        <Pressable
          onPress={openNew}
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text style={styles.addText}>{t('addReminder')}</Text>
        </Pressable>

        <Text style={styles.note}>{t('remindersNote')}</Text>
      </ScrollView>

      <ReminderModal
        visible={modalVisible}
        initial={
          editing
            ? { label: editing.label, hour: editing.hour, minute: editing.minute, days: editing.days }
            : null
        }
        suggestions={getHabitNames()}
        onClose={() => {
          setModalVisible(false);
          setEditing(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
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
  scroll: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8, gap: 12 },
  headerBlock: { paddingVertical: 6 },
  h1: { fontSize: 28, fontWeight: '800', color: C.text },
  h2: { fontSize: 14, color: C.muted, marginTop: 2 },

  card,
  empty: { fontSize: 14, color: C.muted, paddingVertical: 8, lineHeight: 20 },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flex: 1, gap: 2, paddingRight: 12 },
  time: { fontSize: 22, fontWeight: '800', color: C.text },
  label: { fontSize: 15, fontWeight: '600', color: C.text },
  days: { fontSize: 12, color: C.muted, marginTop: 2 },
  dim: { color: C.faint },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 4,
  },
  addText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  note: { fontSize: 11, color: C.faint, textAlign: 'center', lineHeight: 16, marginTop: 6 },
  pressed: { opacity: 0.6 },
});
