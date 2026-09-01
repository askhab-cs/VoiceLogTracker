import { File } from 'expo-file-system';

import { isValidMeasure, unitToKind } from './metrics';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const ACCESS_TOKEN = process.env.EXPO_PUBLIC_VOICE_LOG_ACCESS_TOKEN;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

export type ParsedMeasure = { kind: string; value: number; unit: string | null };

export type ParsedEntry = {
  name: string;
  category: string | null;
  measures: ParsedMeasure[];
  raw_text: string;
  confident: boolean;
  log_date: string;
};

function shortText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

export async function parseLog(
  uri: string,
  knownHabits: string[],
  today: string,
  language: string = 'en',
  knownCategories: string[] = []
): Promise<ParsedEntry[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ACCESS_TOKEN) {
    throw new Error('Voice parsing is not configured on this device.');
  }
  if (!uri) throw new Error('No recording was created.');

  const file = new File(uri);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    if (file.size != null && file.size > MAX_AUDIO_BYTES) {
      throw new Error('The recording is too large. Keep it under 8 MB.');
    }
    const audio = await file.base64();
    if (audio.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4) {
      throw new Error('The recording is too large. Keep it under 8 MB.');
    }

    const lower = uri.toLowerCase();
    const mimeType = lower.endsWith('.wav')
      ? 'audio/wav'
      : lower.endsWith('.caf')
        ? 'audio/x-caf'
        : lower.endsWith('.mp3')
          ? 'audio/mpeg'
          : lower.endsWith('.webm')
            ? 'audio/webm'
            : 'audio/mp4';

    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'x-voice-log-token': ACCESS_TOKEN,
      },
      body: JSON.stringify({
        audio,
        mimeType,
        known_habits: knownHabits.slice(0, 100),
        known_categories: knownCategories.slice(0, 100),
        today,
        language,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('This device is not authorised for voice parsing.');
      if (res.status === 413) throw new Error('The recording is too large.');
      if (res.status === 429) throw new Error('Too many recordings. Try again in a minute.');
      throw new Error('Voice parsing is temporarily unavailable.');
    }

    const data = (await res.json()) as { entries?: unknown };
    const list = Array.isArray(data.entries) ? data.entries.slice(0, 20) : [];
    return list
      .map((candidate): ParsedEntry | null => {
        const e =
          candidate && typeof candidate === 'object'
            ? (candidate as Record<string, unknown>)
            : {};
        const rawMeasures = Array.isArray(e.measures) ? e.measures.slice(0, 12) : [];
        const measures = rawMeasures.flatMap((candidateMeasure): ParsedMeasure[] => {
          const m =
            candidateMeasure && typeof candidateMeasure === 'object'
              ? (candidateMeasure as Record<string, unknown>)
              : {};
          const parsed: ParsedMeasure = {
            kind: shortText(m.kind, 20).toLowerCase(),
            value: typeof m.value === 'number' ? m.value : Number.NaN,
            unit: m.unit == null || shortText(m.unit, 20) === ''
              ? null
              : shortText(m.unit, 20).toLowerCase(),
          };
          return isValidMeasure(parsed) && parsed.value <= 1_000_000 ? [parsed] : [];
        });

        if (rawMeasures.length === 0 && typeof e.quantity === 'number') {
          const legacy: ParsedMeasure = {
            kind: unitToKind(e.unit == null ? null : String(e.unit)),
            value: e.quantity,
            unit: e.unit == null ? null : shortText(e.unit, 20).toLowerCase(),
          };
          if (isValidMeasure(legacy)) measures.push(legacy);
        }

        const name = shortText(e.name, 80);
        if (!name) return null;
        const category = shortText(e.category, 80);
        return {
          name,
          category: category || null,
          measures,
          raw_text: shortText(e.raw_text, 500),
          confident: e.confident !== false,
          log_date: today,
        };
      })
      .filter((entry): entry is ParsedEntry => entry !== null);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Voice parsing timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    try {
      file.delete();
    } catch {
      // The recorder may already have cleaned up its temporary file.
    }
  }
}
