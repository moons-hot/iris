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
4. Open `/groundbase`. Click Asteria, Helios, Kepler, and Selene to inspect the same metric
   families, ground alerts, and the Tiger downlink table. Onboard send stays instant; Tiger
   stores ground-receive 20 minutes later to show light-time from deep space.

## ESP32 audio (USB + Web Serial)

Firmware lives in [`firmware/iris_station`](firmware/iris_station). Flash with Arduino IDE
(ESP32-S3). Install **audio-driver** + **audio-tools** from GitHub (AudioKit is obsolete — see
firmware README). On `/station`, click **Connect ESP32** and use the mic button: the UI sends
`start` / `stop` over USB, receives a **24 kHz mono WAV**, posts it to Grok Voice via `/api/voice`,
runs the investigation, then streams TTS PCM back to the speaker.

See [`firmware/iris_station/README.md`](firmware/iris_station/README.md) for the serial JSON
contract. The HTTP fallback (browser mic or Wi-Fi POST) is unchanged:

POST multipart form data to `/api/voice` with an `audio` field and optionally `crewId=A01`:

```json
{ "transcript": "…", "voiceAssessment": "…" }
```

NASA reference used in the investigation prompt:
https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=95