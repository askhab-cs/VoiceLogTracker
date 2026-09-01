# parse-log Edge Function

This function accepts a short base64-encoded recording, sends it to Gemini, and
returns validated activity entries. It does not store the audio.

## Required secrets

| Secret | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Kept server-side and used only for Gemini requests |
| `VOICE_LOG_ACCESS_TOKEN` | Personal token required in `x-voice-log-token` |
| `GEMINI_MODEL` | Optional model override; defaults to `gemini-2.5-flash-lite` |
| `ALLOWED_ORIGIN` | Exact allowed web origin; native calls do not send an origin |

## Request

`POST /functions/v1/parse-log`

```json
{
  "audio": "<base64>",
  "mimeType": "audio/mp4",
  "known_habits": ["Reading", "Running"],
  "known_categories": ["Study"],
  "today": "2026-09-01",
  "language": "en"
}
```

Send the Supabase anon key in `Authorization` and the personal token in
`x-voice-log-token`. Requests are limited by size, format, fields, timeout, and
a small per-instance rate limit.

## Response

```json
{
  "entries": [
    {
      "name": "Reading",
      "category": "Study",
      "measures": [{ "kind": "pages", "value": 25, "unit": null }],
      "raw_text": "read 25 pages",
      "confident": true,
      "log_date": "2026-09-01"
    }
  ]
}
```

## Deploy

```bash
npx supabase secrets set GEMINI_API_KEY=YOUR_KEY
npx supabase secrets set VOICE_LOG_ACCESS_TOKEN=YOUR_LONG_RANDOM_VALUE
npx supabase secrets set ALLOWED_ORIGIN=http://localhost:8081
npx supabase functions deploy parse-log
```
