// src/lib/parseLog.ts
// -----------------------------------------------------------------------------
// Client for the Supabase `parse-log` Edge Function.
//
// Takes a recorded audio file URI, reads it as base64, and POSTs it (plus the
// user's known habit names + today's date) to the function, which sends it to
// Gemini and returns clean, structured entries.
//
// The Gemini key lives only on the server. The app only ever sends the public
// Supabase anon key.
// -----------------------------------------------------------------------------

import { File } from 'expo-file-system';

import { unitToKind } from './metrics';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type ParsedMeasure = { kind: string; value: number; unit: string | null };

/** One entry as returned by the function (already normalized to measures). */
export type ParsedEntry = {
  name: string;
  category: string | null;
  measures: ParsedMeasure[];
  raw_text: string;
  confident: boolean;
  log_date: string; // YYYY-MM-DD
};

/**
 * Send a recording to the parse-log function and get back structured entries.
 *
 * @param uri          local file URI from the recorder (e.g. file:///.../rec.m4a)
 * @param knownHabits  existing habit names so the model reuses them
 * @param today        "YYYY-MM-DD" used for log_date
 */
export async function parseLog(
  uri: string,
  knownHabits: string[],
  today: string,
  language: string = 'en',
  knownCategories: string[] = []
): Promise<ParsedEntry[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.startsWith('PASTE_')) {
    throw new Error(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY to .env, then restart with: npx expo start --clear'
    );
  }
  if (!uri) throw new Error('No audio file to send.');

  // Read the recorded file as a base64 string.
  const audio = await new File(uri).base64();

  // iOS HIGH_QUALITY preset records .m4a (audio/mp4). Fall back by extension.
  const lower = uri.toLowerCase();
  const mimeType = lower.endsWith('.wav')
    ? 'audio/wav'
    : lower.endsWith('.caf')
      ? 'audio/x-caf'
      : 'audio/mp4';

  console.log('[parseLog] uri=', uri, 'mime=', mimeType, 'b64len=', audio.length);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      audio,
      mimeType,
      known_habits: knownHabits,
      known_categories: knownCategories,
      today,
      language,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.log('[parseLog] HTTP', res.status, 'detail=', detail);
    throw new Error(`parse-log failed (${res.status}). ${detail}`);
  }

  const data = (await res.json()) as { entries?: any[] };
  const list = Array.isArray(data.entries) ? data.entries : [];
  const entries: ParsedEntry[] = list
    .map((e: any) => {
      // Prefer the new `measures` array; fall back to a legacy single quantity/unit.
      const measures: ParsedMeasure[] = Array.isArray(e?.measures)
        ? e.measures
            .filter((m: any) => m && typeof m.value === 'number' && Number.isFinite(m.value))
            .map((m: any) => ({
              kind: String(m.kind ?? 'count'),
              value: m.value,
              unit: m.unit != null && String(m.unit).trim() !== '' ? String(m.unit) : null,
            }))
        : typeof e?.quantity === 'number' && Number.isFinite(e.quantity)
          ? [{ kind: unitToKind(e?.unit ?? null), value: e.quantity, unit: e?.unit ?? null }]
          : [];
      const category =
        e?.category != null && String(e.category).trim() !== '' ? String(e.category).trim() : null;
      return {
        name: String(e?.name ?? '').trim(),
        category,
        measures,
        raw_text: String(e?.raw_text ?? ''),
        confident: e?.confident !== false,
        log_date: typeof e?.log_date === 'string' && e.log_date ? e.log_date : today,
      };
    })
    .filter((e: ParsedEntry) => e.name.length > 0);

  console.log('[parseLog] OK entries=', JSON.stringify(entries));
  return entries;
}
