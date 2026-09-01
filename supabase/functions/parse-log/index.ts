const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
const ACCESS_TOKEN = Deno.env.get("VOICE_LOG_ACCESS_TOKEN");
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;
const MAX_CONTEXT_ITEMS = 100;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;

const SYSTEM_PROMPT = `You parse short voice notes for a habit tracker.
Return only JSON matching the supplied schema.
Create one entry per distinct activity. Reuse matching known habit and category names.
Use short, repeatable activity names. Preserve the speaker's words in raw_text.
Measures may use only: duration (min/hr), pages, distance (km/mi), sets, reps,
weight (kg/lb), calories (kcal), or count. Use the provided date exactly.
If the audio contains no activity, return an empty entries array.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", nullable: true },
          measures: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              properties: {
                kind: { type: "string" },
                value: { type: "number" },
                unit: { type: "string", nullable: true },
              },
              required: ["kind", "value"],
            },
          },
          raw_text: { type: "string" },
          confident: { type: "boolean" },
          log_date: { type: "string" },
        },
        required: ["name", "measures", "raw_text", "confident", "log_date"],
      },
    },
  },
  required: ["entries"],
};

const ALLOWED_UNITS: Record<string, Set<string | null>> = {
  duration: new Set(["min", "hr"]),
  pages: new Set([null]),
  distance: new Set(["km", "mi"]),
  sets: new Set([null]),
  reps: new Set([null]),
  weight: new Set(["kg", "lb"]),
  calories: new Set(["kcal"]),
  count: new Set([null]),
};
const ALLOWED_MIME_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-caf",
  "audio/webm",
  "audio/ogg",
]);
const LANGUAGES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  ar: "Arabic",
};
const attempts = new Map<string, { count: number; resetAt: number }>();

function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) return origin;
  return null;
}

function corsHeaders(req: Request): HeadersInit {
  const origin = requestOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-voice-log-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function limitedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => String(item).trim().slice(0, 80))
    .filter(Boolean);
}

function allowRequest(req: Request): boolean {
  const key = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") && !requestOrigin(req)) {
      return json(req, { error: "Origin not allowed" }, 403);
    }
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  if (!GEMINI_API_KEY || !ACCESS_TOKEN) {
    return json(req, { error: "Service is not configured" }, 503);
  }

  const suppliedToken = req.headers.get("x-voice-log-token") ?? "";
  if (!safeEqual(suppliedToken, ACCESS_TOKEN)) {
    return json(req, { error: "Unauthorized" }, 401);
  }
  if (!allowRequest(req)) return json(req, { error: "Too many requests" }, 429);

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BASE64_LENGTH + 100_000) {
    return json(req, { error: "Recording is too large" }, 413);
  }
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return json(req, { error: "Content-Type must be application/json" }, 415);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid request body" }, 400);
  }

  const audio = typeof body.audio === "string" ? body.audio : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const today =
    typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
      ? body.today
      : new Date().toISOString().slice(0, 10);
  const language = typeof body.language === "string" && body.language in LANGUAGES
    ? body.language
    : "en";

  if (!audio || audio.length > MAX_BASE64_LENGTH) {
    return json(req, { error: "Recording is missing or too large" }, audio ? 413 : 400);
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return json(req, { error: "Unsupported audio format" }, 415);
  }

  const knownHabits = limitedStrings(body.known_habits);
  const knownCategories = limitedStrings(body.known_categories);
  const languageName = LANGUAGES[language];
  const userText =
    `Output language: ${languageName}.\n` +
    `known_habits: ${JSON.stringify(knownHabits)}\n` +
    `known_categories: ${JSON.stringify(knownCategories)}\n` +
    `today: ${today}\nTranscribe in ${languageName} and keep raw_text in the speaker's words.`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  let geminiRes: Response;
  try {
    geminiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: "user",
          parts: [{ text: userText }, { inlineData: { mimeType, data: audio } }],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return json(req, { error: "Speech processing timed out" }, 504);
  }

  if (!geminiRes.ok) return json(req, { error: "Speech processing failed" }, 502);

  let parsed: { entries?: unknown };
  try {
    const data = await geminiRes.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("") ?? "";
    parsed = JSON.parse(text);
  } catch {
    return json(req, { error: "Speech processing returned an invalid result" }, 502);
  }

  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries.slice(0, 20) : [];
  const entries = rawEntries
    .map((candidate: unknown) => {
      const e = candidate && typeof candidate === "object"
        ? candidate as Record<string, unknown>
        : {};
      const rawMeasures = Array.isArray(e.measures) ? e.measures.slice(0, 12) : [];
      const measures = rawMeasures.flatMap((candidateMeasure: unknown) => {
        const m = candidateMeasure && typeof candidateMeasure === "object"
          ? candidateMeasure as Record<string, unknown>
          : {};
        const kind = String(m.kind ?? "").toLowerCase();
        const value = typeof m.value === "number" ? m.value : Number.NaN;
        const unit = m.unit == null || String(m.unit).trim() === ""
          ? null
          : String(m.unit).trim().toLowerCase();
        if (
          !ALLOWED_UNITS[kind] ||
          !ALLOWED_UNITS[kind].has(unit) ||
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 1_000_000
        ) return [];
        return [{ kind, value, unit }];
      });
      const name = String(e.name ?? "").trim().slice(0, 80);
      const categoryText = String(e.category ?? "").trim().slice(0, 80);
      return {
        name,
        category: categoryText || null,
        measures,
        raw_text: String(e.raw_text ?? "").trim().slice(0, 500),
        confident: e.confident !== false,
        log_date: today,
      };
    })
    .filter((entry) => entry.name.length > 0);

  return json(req, { entries });
});
