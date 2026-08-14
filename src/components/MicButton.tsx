import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useI18n } from '@/lib/i18n';

const C = {
  button: '#111113',
  buttonPressed: '#26262B',
  halo: 'rgba(17,17,19,0.07)',
  white: '#FFFFFF',
  text: '#18181B',
  muted: '#A1A1AA',
  bar: '#26262B',
  barFaint: '#D6D6DB',
};

type Status = 'idle' | 'recording' | 'processing';

const BAR_COUNT = 32;
const BAR_MIN = 3;
const BAR_MAX = 26;
const POLL_MS = 100;

function formatDuration(ms: number) {
  const total = Math.floor((ms ?? 0) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Map iOS metering dB (≈ -160…0) to a 0…1 bar level; speech sits ≈ -45…-5. */
function levelFromDb(db: number | undefined): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0.12;
  const v = (db + 50) / 50;
  return Math.min(1, Math.max(0.08, v));
}

/**
 * Big center record button.
 * - idle: black circle with a white mic.
 * - recording: black circle with a white rounded stop square, a soft pulsing
 *   halo, a live scrolling waveform fed by mic metering, and "Listening · 0:11".
 * - processing: spinner while the recording is parsed.
 */
export default function MicButton({
  onComplete,
}: {
  onComplete?: (uri: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, POLL_MS);
  const [status, setStatus] = useState<Status>('idle');
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0.1));

  // Soft breathing halo behind the button while recording.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (status === 'recording') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
  }, [status, pulse]);

  // Feed the waveform from live metering while recording.
  const meteringRef = useRef(recorderState.metering);
  meteringRef.current = recorderState.metering;
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => {
      const level = levelFromDb(meteringRef.current);
      setBars((prev) => [...prev.slice(1), level]);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [status]);

  async function startRecording() {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('micPermTitle'), t('micPermBody'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setBars(Array(BAR_COUNT).fill(0.1));
      setStatus('recording');
    } catch (e: any) {
      Alert.alert(t('couldNotSaveTitle'), String(e?.message ?? e));
      setStatus('idle');
    }
  }

  async function stopRecording() {
    setStatus('processing');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri ?? '';
      if (onComplete) await onComplete(uri);
    } catch (e: any) {
      Alert.alert(t('couldNotSaveTitle'), String(e?.message ?? e));
    } finally {
      setStatus('idle');
    }
  }

  function handlePress() {
    if (status === 'idle') startRecording();
    else if (status === 'recording') stopRecording();
  }

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.15] });
  const isRecording = status === 'recording';

  return (
    <View style={styles.heroSection}>
      <View style={styles.buttonWrap}>
        {isRecording && (
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
          />
        )}
        <Pressable
          onPress={handlePress}
          disabled={status === 'processing'}
          style={({ pressed }) => [
            styles.mic,
            pressed && styles.micPressed,
          ]}>
          {status === 'processing' ? (
            <ActivityIndicator size="large" color={C.white} />
          ) : isRecording ? (
            <View style={styles.stopSquare} />
          ) : (
            <Ionicons name="mic" size={44} color={C.white} />
          )}
        </Pressable>
      </View>

      {isRecording ? (
        <>
          <View style={styles.wave}>
            {bars.map((b, i) => (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    height: BAR_MIN + b * (BAR_MAX - BAR_MIN),
                    backgroundColor: b > 0.12 ? C.bar : C.barFaint,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.listenRow}>
            <View style={styles.listenDot} />
            <Text style={styles.listenText}>
              {t('micListening')} · {formatDuration(recorderState.durationMillis)}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.heroTitle}>{t('appName')}</Text>
          <Text style={styles.heroSub}>
            {status === 'processing' ? t('micProcessing') : t('micIdleHint')}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroSection: { alignItems: 'center', paddingVertical: 8, gap: 6 },
  buttonWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  halo: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: C.halo,
  },
  mic: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: C.button,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#18181B',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  micPressed: { backgroundColor: C.buttonPressed, transform: [{ scale: 0.97 }] },
  stopSquare: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.white },

  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: BAR_MAX + 2,
    marginTop: 2,
  },
  waveBar: { width: 3, borderRadius: 2 },

  listenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  listenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.text },
  listenText: { fontSize: 14, fontWeight: '600', color: C.text },

  heroTitle: { fontSize: 28, fontWeight: '700', color: C.text },
  heroSub: { fontSize: 15, color: C.muted, textAlign: 'center' },
});
