---
name: MED-1 Implementation
overview: "Build MED-1 incrementally inside the existing [ui/](ui/) Next.js app: in-memory SQLite mission state, a deterministic investigation engine, spacecraft UI, crew escalation, Grok Voice at the station, then autonomous mode and ground handoff—each step shippable and demo-testable on its own."
todos:
    - id: step-1-db
      content: SQLite schema, seed Mars crew/env data, mission + crew API routes
      status: completed
    - id: step-2-station-ui
      content: Sleek shadcn + Tailwind station dashboard (crew select, vitals, env strip)
      status: pending
    - id: step-3-investigation
      content: Deterministic investigation state machine + APIs + station action loop
      status: pending
    - id: step-4-baseline
      content: Personal baseline comparison and deviation evidence labeling
      status: pending
    - id: step-5-evidence
      content: Spacecraft, space-environment JSON, and historical evidence board
      status: pending
    - id: step-6-crew-escalation
      content: Multi-crew symptom linking and shared-event UI transition
      status: pending
    - id: step-7-grok-voice
      content: Grok Voice session route + push-to-talk wired to investigation APIs
      status: pending
    - id: step-8-autonomous-handoff
      content: Link toggle, sync queue, ground medical event package export
      status: pending
isProject: false
---

# ndcsMED-1 step-by-step implementation plan

## Stack and architecture (locked for hackathon)

| Layer                 | Choice                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI                    | Next.js 16 App Router in [ui/src/app/](ui/src/app/) + Tailwind (already present)                                                                                         |
| Onboard “computer”    | Server-only modules + Route Handlers under `ui/src/app/api/`                                                                                                             |
| Persistence           | **SQLite in-memory** via `better-sqlite3` (singleton in dev so HMR does not wipe state unexpectedly—or explicit `globalThis` cache); schema + seed in `ui/src/lib/db/`   |
| AI (judging)          | **Grok Voice API** as primary demo surface; typed chat as fallback when mic/API fails                                                                                    |
| NASA / space evidence | **Curated JSON cache** shipped with the repo (5–15 snippets tagged by topic: headache, CO2, radiation, cardiovascular adaptation)—not live OSDR scraping during the demo |

```mermaid
flowchart LR
  subgraph station [MedicalStation_UI]
    Voice[Grok_Voice]
    Panel[Investigation_Panel]
  end
  subgraph onboard [Onboard_Next_Server]
    API[API_Routes]
    Engine[Investigation_Engine]
    DB[(SQLite_memory)]
  end
  Voice --> API
  Panel --> API
  API --> Engine
  Engine --> DB
```

**Product guardrails baked into code from step 3 onward:** every user-facing string and LLM system prompt enforces _investigation not diagnosis_; evidence items carry `kind`: `observation` | `personal_deviation` | `correlation` | `historical_context`.

---

## Step 1 — Mission shell + in-memory data plane (done)

**Build**

- Add DB bootstrap: `ui/src/lib/db/schema.sql`, `ui/src/lib/db/client.ts`, `ui/src/lib/db/seed.ts`.
- Tables (minimal): `crew`, `baseline_metrics`, `measurements`, `environment_readings`, `historical_evidence`, `mission_state`.
- Seed **Mars transit, day ~180**, 4 crew (`A01`–`A04`), A02 baseline HR ~62, mission env with **one latent anomaly** (e.g. elevated cabin CO2 or O2 fraction drift) not obvious until queried.
- Route Handlers: `GET /api/mission`, `GET /api/crew/[id]`, `GET /api/environment`.
- Replace boilerplate [ui/src/app/page.tsx](ui/src/app/page.tsx) with a link into `/station` (or redirect).

**You can test**

- `pnpm dev` → open `/api/crew/A02` → JSON shows personal baselines vs population reference.
- `/api/mission` shows crew roster, simulated **Earth comm delay** (e.g. 12–22 min one-way), mission day.

**Visible difference:** the app is no longer a T3 placeholder; it exposes real mission data from “onboard storage.”

---

## Step 2 — Medical station UI (sleek shadcn dashboard)

**Goal:** A **simple, proper** medical station screen—readable in 10 seconds, no feature creep. Tailwind for layout; **shadcn/ui** for polished primitives. This step is **context + identity + vitals + environment only**; the investigation loop stays in Step 3.

**Design principles**

- **One screen, three jobs:** (1) where we are in the mission, (2) who is at the station, (3) what we know about their health and the cabin right now.
- **Sleek, not busy:** dark theme, generous whitespace, semantic tokens (`bg-background`, `text-muted-foreground`)—no neon “sci-fi” chrome, no charts, no fake telemetry wallpaper.
- **Core product unchanged:** we are not building a health analytics dashboard; we are building the **frame** that Step 3’s investigation UI will slot into (center column reserved for conversation/actions later).

**Setup (first tasks in this step)**

- Run shadcn init in `ui/` if `components.json` is missing (`pnpm dlx shadcn@latest init`) — default style, **dark** class on `html` or `layout` for station routes.
- Add only the components needed (keep the tree small):
  - `card`, `badge`, `select`, `separator`, `skeleton` (loading)
  - Optional: `alert` for a single non-diagnostic disclaimer line (“Investigation support — not a diagnosis”)

**Layout** — `ui/src/app/station/page.tsx` (+ `ui/src/app/station/layout.tsx` if useful for dark shell)

| Zone | Content | shadcn building blocks |
|------|---------|-------------------------|
| **Top bar** | MED-1 title, mission name, **Mission day 180**, **Earth comm ~18 min** one-way, link status `connected` (read-only for now) | `Card` or plain header + `Badge` variants |
| **Crew** | **Select** crew A01–A04 (default A02 for demo); show name + role | `Select` + `Card` |
| **Vitals** | For selected crew: last known HR / SpO2 / temp + **personal baseline** (mean or min–max) vs **population range**—short labels, no diagnosis copy | 2–3 `Card`s in a responsive grid |
| **Cabin environment** | Compact list from `/api/environment`: metric, value, unit, `Badge` **nominal** vs **above/below nominal** (CO₂ should show as non-nominal) | `Card` + `Badge`; one line disclaimer that anomaly ≠ cause |

**Data wiring**

- Server Components preferred: fetch `GET /api/mission`, `/api/crew/[id]`, `/api/environment` via shared `lib` helpers (or direct `queries` on server—avoid duplicating logic).
- Client only where needed: crew `Select` updates URL (`/station?crew=A02`) or local state; page refetches crew payload for that id.
- Loading: `Skeleton` placeholders; errors: single `Alert`, not custom divs.

**Components** (thin wrappers, no business logic)

- `ui/src/components/station/station-header.tsx`
- `ui/src/components/station/crew-selector.tsx`
- `ui/src/components/station/vitals-summary.tsx`
- `ui/src/components/station/environment-strip.tsx`
- Reuse `ui/src/components/ui/*` from shadcn; follow [shadcn skill](C:\Users\nanna\.agents\skills\shadcn\SKILL.md) (semantic colors, `Card` composition, `Badge` for status).

**Explicitly out of scope for Step 2** (defer to later steps)

- Investigation transcript, symptom entry, action buttons → Step 3
- Baseline deviation engine UI copy beyond showing numbers → Step 4
- Historical evidence board, space weather, crew escalation banner → Steps 5–6
- Grok Voice, autonomous toggle, handoff export → Steps 7–8
- Extra pages, settings, crew roster tables, charts/sparklines, animations, `POST /api/demo/reset` unless you hit a demo blocker

**Optional (only if zero cost)**

- `POST /api/demo/reset` to re-seed in-memory DB between judge runs.

**You can test**

1. `pnpm dev` → **http://localhost:3000/station**
2. Mission bar shows day **180**, comm delay **18** min, four crew in selector.
3. Select **A02** → vitals cards show HR baseline **~62** and population band **60–100**; latest measurements from seed visible.
4. Environment card lists readings; **CO₂** shows non-nominal badge; copy does not say CO₂ “caused” anything.
5. Resize to mobile width: grid stacks; nothing critical hidden.
6. Home → “Open medical station” still works; APIs unchanged if called directly.

**Visible difference:** judges see a **clean MED-1 station** with real onboard data—not raw JSON, not a placeholder—and the UI clearly leaves room for the investigation loop as the hero in Step 3.

---

## Step 3 — Investigation engine v1 (deterministic loop)

**Build**

- Core types + state machine in `ui/src/lib/investigation/`:
    - `Investigation` with `scope: individual | crew`, `status`, `evidence[]`, `open_questions[]`, `completed_actions[]`.
    - Loop implementation: **observe → compare → missing evidence → collect → reevaluate** driven by rules, not Grok.
- Tables: `investigations`, `investigation_evidence`, `investigation_events`.
- APIs:
    - `POST /api/investigations` — body: `{ crewId, reportedSymptoms: string[] }`
    - `POST /api/investigations/[id]/actions` — e.g. `record_measurement`, `answer_question`, `check_environment`
    - `GET /api/investigations/[id]`
- Station UI: **conversation transcript panel** (typed for now) + **“Recommended next step”** card + action buttons (“Take heart rate”, “Record SpO2”, “Review cabin environment”).

**Rule examples (demo-critical)**

- On create: add symptom observations; set open question “Need current heart rate.”
- After HR submitted: run baseline compare (Step 4 logic can live here early); if deviated, add `personal_deviation` evidence; if SpO2/temp missing, ask for them.
- After vitals complete: auto-action `check_environment` pulls env readings into evidence.

**You can test**

- As A02, type symptoms “dizzy, headache” → investigation created.
- Follow prompts → enter HR **84** → investigation shows deviation + asks for SpO2/temp.
- Complete flow → env anomaly appears as **correlation**, wording like “occurred during unusual cabin reading,” never “caused by.”

**Visible difference:** the product is the **investigation loop**, not charts.

---

## Step 4 — Personal baseline & mission-phase awareness

**Build**

- `ui/src/lib/baseline/compare.ts`: for each metric, compute status:
    - `within_personal_baseline`
    - `elevated_vs_personal_baseline` / `depressed_vs_personal_baseline`
    - optional `drifting_over_mission` (simple: compare last 7 seeded points vs first 7 for demo narrative)
- Surface in UI: side panel **“Normal for A02”** vs **“Right now”** with plain-language deviation labels (no diagnosis).
- Optional proactive hook: `GET /api/crew/[id]/trends` flags multi-metric drift; station can show a quiet “routine check suggested” before symptoms (nice-to-have if time; keep thin).

**You can test**

- HR 72 for A02 → no deviation; HR 84 → flagged “significant vs A02 baseline (~62).”
- Copy audit: no sentence contains “diagnose”, “you have”, “caused by”.

**Visible difference:** judges see **personal baseline** as the core insight.

---

## Step 5 — Spacecraft + space-environment + NASA historical evidence layers

**Build**

- Extend `check_environment` to attach structured evidence: spacecraft readings + **cached space weather / radiation summary** for mission day (static JSON in `ui/src/data/space-environment.json`).
- `historical_evidence` table already seeded; retrieval in `ui/src/lib/evidence/retrieve.ts` by **tags** (symptom + physiological category + env anomaly type)—keyword/tag match is enough for hackathon.
- UI: **Evidence board** grouped into Astronaut | Spacecraft | Space environment | Historical context, each card labeled with evidence `kind`.

**You can test**

- Complete A02 individual investigation → board shows 4 layers.
- Historical cards say “Previous spaceflight research documented…” not “this astronaut has X.”

**Visible difference:** satisfies **Make it Legendary** (real space context) without overclaiming causality.

---

## Step 6 — Crew-wide escalation (demo climax)

**Build**

- `ui/src/lib/investigation/crew-escalation.ts`:
    - Within rolling window (e.g. 48h mission time), if **≥2 crew** report overlapping symptoms (headache), merge or link investigations under a `crew_investigation_id`, set `scope: crew`, bump priority on env evidence.
- APIs: creating investigation for A03 with headache auto-updates A02’s open investigation.
- UI state change: banner **“POSSIBLE SHARED CREW EVENT — 2/4 crew”**, reprioritized env section, individual narratives preserved underneath.

**You can test**

- Run A02 flow partially or fully → switch to **A03**, report “headache too” → banner + linked evidence counts **2/4**.
- Confirm individual deviations (A02 HR) still visible; env anomaly surfaced as **shared lead**.

**Visible difference:** the “MED-1 reasons across the crew” moment works live.

---

## Step 7 — Grok Voice at the medical station

**Build**

- Env: `XAI_API_KEY` in `.env` (document in [ui/.env.example](ui/.env.example)).
- `ui/src/app/api/voice/session/route.ts` — server-side Grok Voice session orchestration (keep keys off client).
- Station UX:
    - **Push-to-talk** or hold-to-speak → transcript appears in investigation thread.
    - Grok used to: (1) **paraphrase back** investigation-safe language, (2) extract structured intents (`report_symptoms`, `confirm_action`, `read_measurement_value`) sent to existing investigation APIs—**engine remains source of truth**.
- System prompt: explicit refusal to diagnose; must call structured “next step” aligned with engine recommendations.
- Fallback: if Voice fails, typed input still works (required for judging reliability).

**You can test**

- Speak: “I’m A02, dizzy with a headache” → same investigation as Step 3 typed path.
- Speak HR value or press UI button → deviation appears with voice readout optional.

**Visible difference:** hackathon Grok requirement is **center stage** in the demo script.

---

## Step 8 — Autonomous mode, sync queue, and ground medical packet

**Build**

- `mission_state.link_status`: `connected | autonomous` (toggle in station header for demo).
- When autonomous:
    - Banner: **EARTH LINK LOST — AUTONOMOUS MEDICAL MODE**
    - Voice/text and investigation loop **continue**; Grok calls skipped or queued locally.
    - `sync_queue` table stores events with payload.
- On reconnect: `POST /api/sync/push` marks queue flushed; optional “deep analysis” stub message.
- `GET /api/investigations/[id]/handoff` returns **Ground Medical Event Package** JSON (and printable Markdown view at `/station/handoff/[id]`):
    - crew involved, symptoms, personal deviations, measurements, crew signal, env + space + historical sections, completed actions, open questions.
- Polish for judging: 3-minute **scripted demo path** page or `?demo=1` checklist; reset endpoint.

**You can test**

- Toggle link off mid-investigation → finish measurements → queue grows.
- Toggle on → handoff packet complete enough that a clinician could orient in 30 seconds.
- Full run: A02 voice → HR deviation → env → A03 headache → crew escalation → handoff export.

**Visible difference:** autonomous spacecraft system first, Earth augmentation second—matches your spec’s closing beat.

---

## Suggested folder map (after all steps)

```
ui/src/
  app/
    station/page.tsx
    station/handoff/[id]/page.tsx
    api/mission/...
    api/investigations/...
    api/voice/session/...
    api/sync/...
  lib/
    db/
    investigation/
    baseline/
    evidence/
  data/
    historical-evidence.json
    space-environment.json
  components/station/
  components/ui/          # shadcn primitives
```

---

## Demo script alignment (what to rehearse)

1. Identify **A02** → voice report dizziness + headache.
2. MED-1 requests HR → **84** → personal deviation; other vitals normal.
3. Environment check → abnormal cabin reading + historical context cards.
4. **A03** reports headache → **2/4 crew** escalation.
5. Toggle **autonomous** briefly → continue checklist → restore link → open **handoff packet**.

---

## Scope control (if time runs short)

| Cut last                   | Keep                              |
| -------------------------- | --------------------------------- |
| Mission-phase drift trends | Steps 1–6 + minimal Voice in 7    |
| Space weather JSON layer   | Spacecraft env + historical cache |
| Fancy visuals              | Evidence board + crew escalation  |

---

## Dependencies to add (when implementing)

- `better-sqlite3` + `@types/better-sqlite3` (Step 1 — done)
- **shadcn/ui** + Tailwind semantic theme (Step 2 — station dashboard; [shadcn skill](C:\Users\nanna\.agents\skills\shadcn\SKILL.md))
- Grok/xAI SDK or fetch to Voice endpoints (Step 7)

No separate backend service; all logic stays in the Next.js server boundary you chose.
