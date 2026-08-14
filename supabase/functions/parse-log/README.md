# parse-log

Supabase Edge Function. Takes a short voice recording, sends the audio to the
**Gemini Flash-Lite** API with the system prompt + the user's `known_habits` +
`today`, and returns structured JSON entries.

The Gemini key is read from the **function secret** `GEMINI_API_KEY` — never
sent from the app.

## Request

`POST /functions/v1/parse-log` (send the Supabase anon key as `Authorization: Bearer <ANON_KEY>`)

JSON body:

```json
{
  "audio": "<base64 of the audio file>",
  "mimeType": "audio/mp4",
  "known_habits": ["Reading", "Gym", "Basketball"],
  "today": "2026-06-08"
}
```

(Also accepts `multipart/form-data` with fields `audio` (file), `known_habits`
(JSON string), `today`.)

## Response

```json
{
  "entries": [
    { "name": "Reading", "quantity": 120, "unit": "minutes",
      "raw_text": "read my book for two hours", "confident": true,
      "log_date": "2026-06-08" }
  ]
}
```

## Config (secrets)

| Secret           | Required | Default                 |
| ---------------- | -------- | ----------------------- |
| `GEMINI_API_KEY` | yes      | —                       |
| `GEMINI_MODEL`   | no       | `gemini-2.5-flash-lite` |

## Deploy

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set GEMINI_API_KEY=YOUR_KEY
npx supabase functions deploy parse-log
```
