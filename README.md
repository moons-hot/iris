# Iris

Onboard medical investigation for crews that are too far from Earth for real-time help.

When an astronaut reports a symptom, Iris compares it to that person's baseline, live ship telemetry, and NASA OSDR evidence. It does not diagnose. It says what may be related, what is still uncertain, and what to check next.

<!-- Demo video -->
<!-- ![Iris demo](docs/demo.mp4) -->

<!-- Screenshots -->
<!-- ![Station](docs/station.png) -->
<!-- ![Mission Control](docs/groundbase.png) -->

## What it does

- **Station** (`/station`): crew console. Speak or type a report. Live vitals, cabin air, radiation, and an investigation thread.
- **Mission Control** (`/groundbase`): same fleet from the ground. Onboard send is instant. Tiger stores ground-receive 20 minutes later.
- Two sim presets: **Mild** (breathless + headache) and **Dire** (nausea, flashes, radiation).

Grok Voice hears what they say and how they say it. An ESP32 is the physical mic and speaker.

## Stack

| Layer | What we used |
| --- | --- |
| App | Next.js, React, Tailwind, shadcn |
| Investigation | Grok via Vercel AI SDK (`ai`, `@ai-sdk/xai`) |
| Voice | Grok Voice transcribe + TTS, browser mic fallback |
| Hardware | ESP32-S3, USB Web Serial |
| Onboard data | SQLite (`better-sqlite3`), crew baselines + OSDR-style evidence |
| Ground downlink | Tiger Data (Postgres), 20 min light-time delay |
| Built in | Cursor, Origin, Grok Bot |

Without `XAI_API_KEY`, the station still runs on seeded onboard context.

## Run

```bash
cd ui
pnpm install --ignore-workspace
pnpm dev
```

Copy `ui/.env.example` to `ui/.env`. Set `XAI_API_KEY` for Grok. Set `TIGER_DATABASE_URL` for the delayed comms table.

ESP32 firmware: [`firmware/iris_station`](firmware/iris_station).
