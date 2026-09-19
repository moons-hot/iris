# Iris

Iris is an onboard, baseline-aware health investigation station for long-duration spaceflight.
It is a hackathon demo for healthcare and spaceflight monitoring: it surfaces possible hazards
and evidence to collect without presenting a diagnosis or claiming causality.

## Run

```bash
cd ui
pnpm install --ignore-workspace
pnpm dev
```

Set `XAI_API_KEY` in `ui/.env` to enable Grok generation through Vercel AI SDK and Grok Voice
transcription/speech. Without it, Iris stays fully demoable with seeded onboard context and browser
speech fallback.

## Judge demo

1. Open `/station`.
2. Select **Mild: breathless + headache**, then speak or type a mild symptom report.
3. Select **Dire: radiation + visual symptoms**, then report nausea, low blood pressure, vomiting,
   light flashes, and concern. Iris will show the radiation/peer-log context and high-priority next evidence.

## ESP32 audio contract

POST multipart form data to `/api/voice` with an `audio` field (WAV, PCM, or browser-supported
recording) and optionally `crewId=A01`. The endpoint returns:

```json
{ "transcript": "…", "voiceAssessment": "…" }
```

For local Wi-Fi development, set `VOICE_INGEST_URL` to
`http://<computer-lan-ip>:3000/api/voice`; ESP32 cannot resolve localhost on the host machine.

NASA reference used in the investigation prompt:
https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=95