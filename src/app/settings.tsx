import { Ionicons } from '@expo/vector-icons';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LANG_OPTIONS, useI18n } from '@/lib/i18n';

const C = {
  bg: '#F2F2F5',
  card: '#FFFFFF',
  text: '#18181B',
  muted: '#A1A1AA',
  faint: '#C7C7CC',
  hairline: '#ECECEF',
  accent: '#18181B',
};

const APP_VERSION = '1.0.0';

export default function SettingsScreen() {
  const { t, pref, setPref } = useI18n();

  function choose(next: typeof pref) {
    const needsReload = setPref(next);
    if (needsReload) {
      Alert.alert(t('restartNeededTitle'), t('restartNeededBody'));
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.h1}>{t('settingsTitle')}</Text>
        </View>

        {/* Language */}
        <Text style={styles.section}>{t('language')}</Text>
        <View style={styles.card}>
          {LANG_OPTIONS.map((opt, i) => {
            const selected = pref === opt.pref;
            return (
              <Pressable
                key={opt.pref}
                onPress={() => choose(opt.pref)}
                style={({ pressed }) => [
                  styles.row,
                  i < LANG_OPTIONS.length - 1 && styles.rowDivider,
                  pressed && styles.pressed,
                ]}>
                <View>
                  <Text style={styles.rowTitle}>{opt.native}</Text>
                  {opt.pref === 'auto' && <Text style={styles.rowSub}>{t('langAutoSub')}</Text>}
                </View>
                {selected && <Ionicons name="checkmark" size={20} color={C.accent} />}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.version}>{t('aboutVersion', { v: APP_VERSION })}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8, gap: 8 },
  headerBlock: { paddingVertical: 6 },
  h1: { fontSize: 28, fontWeight: '800', color: C.text },
  section: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
    marginHorizontal: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    shadowColor: '#18181B',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairline },
  rowTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  version: { fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 16 },
  pressed: { opacity: 0.6 },
});
