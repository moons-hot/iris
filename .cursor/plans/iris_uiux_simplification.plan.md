---
name: Iris UIUX simplification
overview: Cut Iris to Doctor + Patient (four screens), expand seed data, add doctor list/lookup APIs, simplify break-glass UX, and Grok-summarize the patient timeline. Execute sections 01–07 in order; section 08 is parked.
todos:
  - id: cut
    content: "01: Move Lens type, delete provider/engineer pages, rewrite nav and root redirect"
    status: pending
  - id: data-api
    content: "02: Expand seed data and add GET /api/doctor/patients and /api/doctor/lookup"
    status: pending
  - id: login-list
    content: "03: Build /login and /doctor (care-team list + off-list disclosure)"
    status: pending
  - id: chart
    content: "04: Build /doctor/patients/[id] chart with Treatment/Research toggle"
    status: pending
  - id: breakglass
    content: "05: Break-glass modal, EmergencyBanner, off-list reveal wiring"
    status: pending
  - id: timeline
    content: "06: Rewrite /patient timeline + cached Grok summarizer"
    status: pending
  - id: verify
    content: "07: pnpm check, smoke test, manual walk, README/DEMO updates"
    status: pending
isProject: false
---

# Iris UI/UX simplification

Execution plan for cutting Iris down to two roles and four screens. Work through
**01 → 07** in order. Each section is a checklist: every box is a concrete edit
to a named file. **Section 08** is deliberately out of scope for this pass.

## Why

The demo currently spreads five roles across five screens. A judge watching for
ninety seconds cannot tell which part is the idea and which part is scaffolding.
The idea is: **purpose decides the view, emergency access is never blocked, and
the patient can see all of it.** Everything that does not serve that is noise.

## Target

Four screens. Nothing else in the navigation.

| Route                   | Who     | What it is                                                  |
| ----------------------- | ------- | ----------------------------------------------------------- |
| `/login`                | Doctor  | One centered card: "Insert your CareKey", demo key fallback |
| `/doctor`               | Doctor  | A flat list of this doctor's own patients, plus a search box |
| `/doctor/patients/[id]` | Doctor  | The patient chart, single column, Treatment/Research toggle |
| `/patient`              | Patient | "Who accessed my information?" in plain English             |

`/security` stays reachable by URL for the compliance story but is removed from
the navigation and is not redesigned.

## Locked decisions

Do not relitigate these mid-task.

1. **The cut is UI-only.** Policy rules for `nurse`, `reception` and `engineer`
   in [ui/src/server/iris/policy-rules.ts](ui/src/server/iris/policy-rules.ts),
   the delegation API, [engine.test.ts](ui/src/server/iris/engine.test.ts), and
   [smoke.mjs](ui/scripts/smoke.mjs) stay intact.
2. **Seed data expands** to roughly eight on-team and four off-team patients.
   Rich clinical fragments stay on `P1048`.
3. **Grok summarizes the patient timeline** (one sentence per access), not the
   doctor's chart.
4. **Nothing blocks break-glass.** No rate limit, cooldown, or extra confirmation.
5. **MITRE / OWASP / NIST / breach research is parked** — see section 08.

## Current state worth knowing

- Routes today: `/`, `/provider`, `/engineer`, `/patient`, `/security`. Target
  routes do not exist yet — a restructure, not a restyle.
- `Lens` is exported from [provider/page.tsx](ui/src/app/provider/page.tsx);
  move it before deleting that page.
- No `sheet` primitive in `ui/src/components/ui/` — hand-roll the voice panel.
- Names are encrypted fragments; off-list lookup matches server-side without
  returning names pre-break-glass.
- Encounter `reason` is plaintext — no policy call for the doctor list column.
- `/patient` polls every 5s — Grok summaries must be cached by `eventId`.
- Use existing colour tokens in [globals.css](ui/src/styles/globals.css).

## Order of work

```
01  cut                 compiling tree, no dead links
02  data-and-api        seed + /api/doctor/*
03  login-and-list      /login and /doctor
04  chart               /doctor/patients/[id]
05  break-glass         modal, banner, off-list reveal
06  patient-timeline    /patient + Grok
07  verify              checks and doc updates
```

`01` and `02` are prerequisites. `03`–`06` can run in any order after `02`.

## Definition of done

- `pnpm check` passes.
- `node scripts/smoke.mjs http://localhost:3000` passes **unmodified**.
- Manual walk in section 07 completes without a dead end.
- Navigation does not link to deleted routes.

---

# 01 - The cut

Goal: compiling tree, no dead links, only Doctor and Patient surfaces. No new
features yet. **Move step 1 before any deletion.**

## 1. Move the `Lens` type out of a page

- [ ] Create [ui/src/lib/lens.ts](ui/src/lib/lens.ts):

```ts
import type { FragmentView } from "@/components/iris/fragment-card";

export type { FragmentView };

/** The server's answer to one (patient, purpose) policy evaluation. */
export interface Lens {
  sessionId: string;
  actor: { id: string; name: string; role: string; department: string };
  patient: { id: string; displayName: string; pseudonym: string };
  purpose: string;
  effectivePurpose: string;
  purposeLabel: string;
  task: string | null;
  breakGlass: boolean;
  breakGlassExpiresAt: string | null;
  breakGlassReason: string | null;
  fragments: FragmentView[];
  allowedCount: number;
  restrictedCount: number;
  summary: string;
  ruleId: string | null;
}
```

- [ ] Update [break-glass-dialog.tsx](ui/src/components/iris/break-glass-dialog.tsx):
      `import type { Lens } from "@/lib/lens";`

## 2. Delete non-doctor surfaces

- [ ] Delete [ui/src/app/engineer/page.tsx](ui/src/app/engineer/page.tsx).
- [ ] Delete [ui/src/app/provider/page.tsx](ui/src/app/provider/page.tsx). Salvage
      SWR keying, `submitUtterance`, and `createHandoff` when building section 04.

## 3. Rewrite navigation

[iris-nav.tsx](ui/src/components/iris/iris-nav.tsx):

- [ ] `LINKS`: only `/doctor` (Patients) and `/patient` (My access).
- [ ] Brand → `/doctor`. Right side: actor name + End session (`signOut()`).
- [ ] Hide header on `/login` (`pathname === "/login"` → `return null`).

## 4. Replace root page

- [ ] [ui/src/app/page.tsx](ui/src/app/page.tsx) → `redirect("/login")` only.

## 5. Locked panel

- [ ] [locked-panel.tsx](ui/src/components/iris/locked-panel.tsx): link to
      `/login`, copy "CareKey" (UI copy only).

## 6. Engineering button

- [ ] Do **not** delete [delegation/route.ts](ui/src/app/api/actions/delegation/route.ts).

## Explicitly keep

| Path | Why |
| ---- | --- |
| policy-rules.ts, engine.ts, engine.test.ts | purpose demo |
| delegation API | audited, smoke-tested |
| security/page.tsx | URL only |
| smoke.mjs | unmodified |
| All other api routes | no API deletion |

## Check

- [ ] `rg -n "app/provider/page|/engineer" ui/src` → nothing.
- [ ] `pnpm check` passes (nav 404s until section 03 — expected).

---

# 02 - Seed data and the two new endpoints

Prerequisite for sections 03–06.

## A. Seed expansion

Edits in [seed-data.ts](ui/src/server/iris/seed-data.ts) unless noted.

**Target:** 12 patients; `DOC-001` on team for 8; 4 off-team (incl. `P2210`).

### A1. Split the name directory

- [ ] Replace `PATIENT_DIRECTORY` with structured `PATIENT_NAMES` and derived
      `PATIENT_DIRECTORY` so [memory.ts](ui/src/server/store/memory.ts) keeps
      working without edits:

```ts
export interface DirectoryEntry {
  firstName: string;
  lastName: string;
}

export const PATIENT_NAMES: Record<string, DirectoryEntry> = {
  P1048: { firstName: "Maya", lastName: "Patel" },
  P2210: { firstName: "Daniel", lastName: "Osei" },
  P3187: { firstName: "Renata", lastName: "Silva" },
  // ...nine more
};

export const PATIENT_DIRECTORY: Record<string, string> = Object.fromEntries(
  Object.entries(PATIENT_NAMES).map(([id, name]) => [
    id,
    `${name.firstName} ${name.lastName}`,
  ]),
);
```

- [ ] Export `splitName(full: string): DirectoryEntry` (split on last space);
      use in doctor APIs and Postgres list path — no schema migration.

### A2. Add patients

- [ ] +9 entries to `SEED_PATIENTS` and `PATIENT_NAMES`. One deliberate surname
      pair so search can return two rows in the demo.

### A3. Care-team relationships

- [ ] Extend `SEED_RELATIONSHIPS` to eight `DOC-001` `attending` rows. Four
      patients have **no** `DOC-001` row (`P2210` + three new ids). Comment
      which ids are off-team.

### A4. Encounters

- [ ] One recent encounter per on-team patient with short clinical `reason`.
      `P1048` keeps two encounters; list uses most recent `startedAt`.

### A5. Minimal fragments for new patients

- [ ] Per new patient: `name`, `date_of_birth`, `visit_reason` only (copy
      `purposeClasses` from `P2210`). Do not add clinical depth; `P1048` stays
      the full chart.

### A6. Backdated audit volume

- [ ] Leave `seed-events.ts` `PATIENTS = ["P1048", "P2210", "P3187"]`; add a
      comment that 4,800 events stay on three ids for timeline density.

## B. `GET /api/doctor/patients`

New file: [ui/src/app/api/doctor/patients/route.ts](ui/src/app/api/doctor/patients/route.ts)

**Request:** `?sessionId=<id>&q=<optional search>`

**Response 200:**

```jsonc
{
  "patients": [
    {
      "id": "P1048",
      "firstName": "Maya",
      "lastName": "Patel",
      "reasonForVisit": "Chest pain evaluation"
    }
  ]
}
```

- [ ] `requireActiveSession`; filter `store.listPatients()` with
      `hasRelationship` (`Promise.all`).
- [ ] `reasonForVisit` from latest encounter; `q` filters first/last/reason
      server-side.
- [ ] Audit: `resourceType: "care_team_list"`, metadata `{ count, query: Boolean(q) }`
      — do not log the query string.

## C. `GET /api/doctor/lookup`

New file: [ui/src/app/api/doctor/lookup/route.ts](ui/src/app/api/doctor/lookup/route.ts)

**Request:** `?sessionId=<id>&q=<search>` (reject `q` length < 2)

**Before break-glass:**

```jsonc
{
  "matches": [
    { "id": "P2210", "onTeam": false, "revealed": false, "firstName": null, "lastName": null }
  ]
}
```

**After break-glass on that patient in this session:**

```jsonc
{
  "matches": [
    { "id": "P2210", "onTeam": false, "revealed": true, "firstName": "Daniel", "lastName": "Osei" }
  ]
}
```

- [ ] Match on memory `PATIENT_NAMES` or Postgres decrypted names only.
- [ ] Never populate name fields when `revealed` is false.
- [ ] `revealed` when active break-glass window applies to that patient id —
      add `activeBreakGlassPatientId(sessionId)` in [context.ts](ui/src/server/iris/context.ts)
      (read latest `expanded_clinical_record` for session).
- [ ] On-team matches: `onTeam: true`, names filled in.
- [ ] Audit every lookup: `patient_lookup`. **No rate limiting.**

## Check

- [ ] Eight care-team patients with reasons; lookup `q=osei` → names null.
- [ ] `pnpm check`; smoke unmodified.

---

# 03 - `/login` and `/doctor`

## `/login`

[ui/src/app/login/page.tsx](ui/src/app/login/page.tsx) — client component.

- [ ] Centered card ~24rem: mark, "Insert your CareKey", muted copy, Connect
      (`connect()`), "Use demo key" → `connectSimulated("IRIS-0042")`.
- [ ] Authenticated → `/doctor` after ~900ms delay.
- [ ] No device picker, no `ROLE_HOME`, no store footer.

## `/doctor`

[ui/src/app/doctor/page.tsx](ui/src/app/doctor/page.tsx)

- [ ] SWR → `/api/doctor/patients`; debounced search; row links to chart.
- [ ] Off-list disclosure → `/api/doctor/lookup`; row "Not on your care team"
      + Break glass; no name/DOB/id before reveal.
- [ ] `BreakGlassDialog` + revalidate lookup on grant.
- [ ] `LockedPanel` when no session.

## Check

- [ ] Demo key → `/doctor` with 8 patients.
- [ ] Off-list lookup response has no name in devtools.

---

# 04 - `/doctor/patients/[id]`

[ui/src/app/doctor/patients/[id]/page.tsx](ui/src/app/doctor/patients/[id]/page.tsx)

- [ ] Single column `max-w-2xl`; sticky emergency banner first (section 05).
- [ ] Header: name, age line, visit reason from lens fragments.
- [ ] Toggle Treatment | Research → SWR re-fetch; `setKeyState` on success.
- [ ] Cards: Medications, Allergies, Cardiac history, Labs — hide empty/denied.
- [ ] "Redacted" chip for `allow_transformed`.
- [ ] Collapsible "N fields withheld…"; footnote link to `/patient`.
- [ ] Floating mic + slide-up panel; `/api/voice/interpret`; Create handoff.
- [ ] Do not use `fragment-card` on this page (keep file for `/security`).

## Check

- [ ] P1048 Treatment vs Research network + UI change.
- [ ] Mic + handoff work.

---

# 05 - Break glass

**Rule:** never block, throttle, or rate-limit emergency access.

## A. Modal

[break-glass-dialog.tsx](ui/src/components/iris/break-glass-dialog.tsx)

- [ ] Shorter copy; auto-close ~1.2s on granted.
- [ ] `onGranted(lens, patientId)` for lookup revalidation.
- [ ] Keep anomaly toast ("Access was still granted").

## B. Emergency banner

[ui/src/components/iris/emergency-banner.tsx](ui/src/components/iris/emergency-banner.tsx)

- [ ] Sticky top, `breakGlassUntil` from session, `mm:ss` countdown.
- [ ] `reloadLens()` when countdown hits zero.

## C. Off-list reveal

- [ ] Server + SWR mutate after grant; link to chart with banner active.

## Check

- [ ] Banner stays visible on scroll; off-list reveal flow end-to-end.

---

# 06 - `/patient` and Grok summarizer

## A. Summarizer

[ui/src/server/grok/timeline.ts](ui/src/server/grok/timeline.ts)

- [ ] Batched Grok call; template fallback; cache by `eventId` (globalThis).
- [ ] No clinical plaintext in prompt.
- [ ] Add `summary` to `TimelineEntry`; wire in history route.

## B. Screen

[ui/src/app/patient/page.tsx](ui/src/app/patient/page.tsx)

- [ ] One sentence per row; emergency group on top; no stat cards.
- [ ] Small `<select>` for demo patient switch.

## Check

- [ ] Works without `GROK_API_KEY`; no Grok spam on 5s poll.

---

# 07 - Verify and clean up

## Automated

```bash
cd ui && pnpm check
pnpm dev   # other shell
node scripts/smoke.mjs http://localhost:3000
```

## Manual walk

Login → doctor list → chart Treatment/Research → off-list break-glass → banner
→ patient timeline one-liners → `/security` by URL only.

## Docs to update

- [ ] [README.md](README.md) layout, withheld-field wording, running instructions.
- [ ] [docs/DEMO.md](docs/DEMO.md) — remove `/engineer` scene; note `/security` URL.

## Last sweep

- [ ] No `/provider` or `/engineer` in `ui/src`.
- [ ] Nav links only to existing routes.

---

# 08 - Parked: security framework argument

**Not in scope for this redesign.**

Future artifact: `docs/security-model.md` (~2 pages), judge-facing.

**MITRE ATT&CK:** T1078 (Valid Accounts) — constrain and log, not prevent auth;
T1119 / T1213 — per-fragment decrypt limits bulk collection.

**OWASP Top 10:** A01 (single decision point in `engine.ts`), A02 (AES-256-GCM +
honest key-mgmt caveats), A09 (`access_events` chain), LLM Top 10 (Grok
`assertScoped`).

**NIST:** CSF Protect/Detect/Respond mapped to policy, dashboard, break-glass
review; 800-53 AC-3, AC-6, AU-2, AU-9, AC-14.

**Breaches (honest one-liners):** Change Healthcare 2024 (credential + lateral —
partial fit); Anthem 2015 (bulk read — strong purpose-bound case); Scripps 2021
(availability — argues *against* blocking break-glass); insider snooping
(patient timeline).

Rules: claim only what the code does ([README.md](README.md) tone); every table
row cites a file under `ui/src/server/`. Pick up after section 07 is clean.
