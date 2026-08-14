// supabase/functions/parse-log/index.ts
//
// Edge Function: parse-log
// -----------------------------------------------------------------------------
// Receives a short voice recording, sends the audio to the Gemini Flash-Lite
// API together with the system prompt + the user's known habit names + today's
// date, and returns structured JSON entries.
//
// The Gemini API key is read from the function's environment secret
// (GEMINI_API_KEY) and is NEVER sent from the app.
//
// Request (POST) — either of:
//   • application/json:  { audio: <base64>, mimeType: string,
//                          known_habits: string[], today: "YYYY-MM-DD" }
//   • multipart/form-data: fields  audio (file), known_habits (JSON string),
//                                  today (string)
//
// Response (200):  { entries: Entry[] }
//   Entry = { name, quantity|null, unit|null, raw_text, confident, log_date }
// -----------------------------------------------------------------------------

import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";

// --- The system prompt sent with every call (verbatim) ----------------------
const SYSTEM_PROMPT = `You are the parsing engine for a minimalist voice habit tracker. The user speaks a short, casual summary of what they did today. Turn that messy speech into clean, structured, trackable entries.

Rules:
- Output ONLY valid JSON matching the schema. No prose, no markdown.
- Split the speech into separate entries — one per distinct activity.
- Give each a short, polished, Title Case name (e.g. "Reading", "Running", "Bench Press"). Keep it generic enough to repeat day to day. For gym/workout activities, name the entry after the specific exercise when one is stated (e.g. "Bench Press", "Squat", "Deadlift") so each lift can be tracked over time; otherwise use the general activity (e.g. "Gym").
- If an activity matches one in \`known_habits\`, reuse that exact name so it groups together over time. Only invent a new name if none fit.
- Give each entry a \`category\` — the broader group it belongs to — so related activities bundle together. Examples: gym/workout activities (bench press, squat, treadmill, cardio) → "Gym"; school/university subjects or modules (calculus, physics, history) → "Study"; cooking, chores, etc. can share sensible groups too. Reuse a name from \`known_categories\` when one fits. Use the SAME category for activities the user clearly groups together. If an activity stands alone and has no natural group, set \`category\` to null. Keep category names short and Title Case, written in the user's language.
- Put every number mentioned into the \`measures\` array. Each measure is { "kind", "value", "unit" }:
    • duration — time spent (unit "min" or "hr")
    • distance — running/walking distance (unit "km" or "mi")
    • pages — pages read (no unit)
    • sets — number of sets (no unit)
    • reps — repetitions per set (no unit)
    • weight — load lifted (unit "kg" or "lb")
    • calories — energy (unit "kcal")
    • count — any other countable thing (optional unit)
- A single activity can have several measures. Example: "bench press, three sets of ten at eighty kilos" → name "Bench Press", measures [{"kind":"sets","value":3},{"kind":"reps","value":10},{"kind":"weight","value":80,"unit":"kg"}].
- The same activity may be measured differently on different days (e.g. reading "thirty minutes" → duration; "twenty pages" → pages). Use whichever kind matches what was said.
- If no number is mentioned for an activity, use an empty \`measures\` array.
- Always keep the user's original words in \`raw_text\`.
- If a phrase is unclear, still create an entry with your best-guess name and set \`confident\` to false.
- If nothing was logged, return an empty \`entries\` array.
- Use the provided \`today\` value for \`log_date\`. Never invent dates.`;

// --- JSON schema Gemini must return (mirrors the SQLite `entries` table) -----
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", nullable: true },
          measures: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string" }, // duration|pages|distance|sets|reps|weight|calories|count
                value: { type: "number" },
                unit: { type: "string", nullable: true },
              },
              required: ["kind", "value"],
            },
          },
          raw_text: { type: "string" },
          confident: { type: "boolean" },
          log_date: { type: "string" }, // YYYY-MM-DD
        },
        required: ["name", "raw_text", "confident", "log_date"],
      },
    },
  },
  required: ["entries"],
};

const ALLOWED_KINDS = new Set([
  "duration",
  "pages",
  "distance",
  "sets",
  "reps",
  "weight",
  "calories",
  "count",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 500);

  // --- 1. Read the request (JSON base64 or multipart file) ------------------
  let audioBase64 = "";
  let mimeType = "audio/mp4";
  let knownHabits: string[] = [];
  let knownCategories: string[] = [];
  let today = "";
  let language = "en";

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      audioBase64 = body.audio ?? body.audioBase64 ?? "";
      mimeType = body.mimeType ?? mimeType;
      knownHabits = Array.isArray(body.known_habits) ? body.known_habits : [];
      knownCategories = Array.isArray(body.known_categories) ? body.known_categories : [];
      today = body.today ?? "";
      language = body.language ?? "en";
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio");
      if (file instanceof File) {
        mimeType = file.type || mimeType;
        audioBase64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
      }
      const kh = form.get("known_habits");
      knownHabits = typeof kh === "string" ? JSON.parse(kh) : [];
      const kc = form.get("known_categories");
      knownCategories = typeof kc === "string" ? JSON.parse(kc) : [];
      today = (form.get("today") as string) ?? "";
      language = (form.get("language") as string) ?? "en";
    } else {
      return json({ error: "Unsupported content-type" }, 415);
    }
  } catch (e) {
    return json({ error: "Invalid request body", detail: String(e) }, 400);
  }

  if (!audioBase64) return json({ error: "No audio provided" }, 400);
  if (!today) today = new Date().toISOString().slice(0, 10);

  // --- 2. Call Gemini Flash-Lite with audio + prompt + context --------------
  const LANG_NAMES: Record<string, string> = {
    en: "English",
    ru: "Russian",
    ar: "Arabic",
  };
  const langName = LANG_NAMES[language] ?? "English";

  const userText =
    `Output language: ${langName}.\n` +
    `known_habits: ${JSON.stringify(knownHabits)}\n` +
    `known_categories: ${JSON.stringify(knownCategories)}\n` +
    `today: ${today}\n` +
    `The audio is spoken in ${langName}. Transcribe it in ${langName}, and write each ` +
    `entry's "name" and "category" as short, clean, capitalized labels in ${langName} (reuse a ` +
    `known_habits / known_categories name if one matches). Always keep "raw_text" in the speaker's original words.`;

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: userText },
          { inlineData: { mimeType, data: audioBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  let geminiRes: Response;
  try {
    geminiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify(geminiBody),
    });
  } catch (e) {
    return json({ error: "Failed to reach Gemini", detail: String(e) }, 502);
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return json({ error: "Gemini error", status: geminiRes.status, detail }, 502);
  }

  // --- 3. Extract + validate the model's JSON -------------------------------
  const data = await geminiRes.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? "";

  let parsed: { entries?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: "Model did not return valid JSON", raw: text }, 502);
  }

  // Normalize so the app always gets a clean, predictable shape.
  const raw = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const entries = raw
    .map((e: Record<string, unknown>) => {
      const rawMeasures = Array.isArray(e?.measures) ? e.measures : [];
      const measures = rawMeasures
        .map((m: Record<string, unknown>) => {
          const value =
            typeof m?.value === "number" && Number.isFinite(m.value) ? m.value : null;
          if (value === null) return null;
          let kind = String(m?.kind ?? "count").toLowerCase();
          if (!ALLOWED_KINDS.has(kind)) kind = "count";
          const unit =
            m?.unit != null && String(m.unit).trim() !== "" ? String(m.unit) : null;
          return { kind, value, unit };
        })
        .filter((m): m is { kind: string; value: number; unit: string | null } => m !== null);
      const category =
        e?.category != null && String(e.category).trim() !== ""
          ? String(e.category).trim()
          : null;
      return {
        name: String(e?.name ?? "").trim(),
        category,
        measures,
        raw_text: String(e?.raw_text ?? ""),
        confident: e?.confident !== false,
        log_date: typeof e?.log_date === "string" && e.log_date ? e.log_date : today,
      };
    })
    .filter((e) => e.name.length > 0);

  return json({ entries });
});
