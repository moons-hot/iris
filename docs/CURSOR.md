# Built in Cursor

Iris was built end to end in Cursor, with agents doing most of the typing and the
team deciding what was worth typing. This file records how, because "we used AI"
is not interesting on its own — what the agent was and was not allowed to decide is.

## What the agent built

| Area                                                              | Agent-driven | Reviewed by hand                                        |
| ----------------------------------------------------------------- | ------------ | ------------------------------------------------------- |
| Tiger schema, hypertable, continuous aggregate                     | yes          | chunk interval, aggregate window                        |
| AES-256-GCM per-fragment crypto and the AAD binding                | yes          | AAD contents, the refuse-to-decrypt invariant           |
| Policy engine and the six purpose rules                            | yes          | every allow list, by a human, line by line              |
| Denial reason strings                                              | yes          | reworded for patients rather than for engineers          |
| Hash-chained audit writer                                          | yes          | canonical field order                                   |
| ESP32-S3 firmware                                                  | yes          | pin assignments, debounce, the 20s confirmation window   |
| WebSerial transport and presence heartbeat                         | yes          | the 8s kill threshold                                   |
| Grok intent extraction, scoped generation, voice transport          | yes          | the prompt's "you do not decide access" framing          |
| All five pages and the `FragmentCard` states                        | yes          | colour semantics, the decision to keep locked cards visible |
| Seed data for Maya Patel P1048                                      | yes          | clinical plausibility of every value                    |
| 35-check end-to-end smoke test                                      | yes          | the assertions that matter for the demo                 |
| README claims table                                                 | yes          | checked against idea.md section 27 word by word          |

## What the agent was not allowed to decide

- **The allow lists.** Every field a purpose can open was read and approved by a
  human. An agent guessing at clinical authorization is exactly the failure mode
  Iris exists to argue against.
- **The claims.** The README's "we say / we do not say" table comes from the spec,
  not from a model's instinct for how to sound impressive.
- **Whether the model can widen access.** This was a hard constraint on the agent
  from the first prompt: the LLM interprets, the policy engine authorizes. The
  runtime assertions in `crypto.ts` and `generate.ts` exist so the constraint is
  checkable rather than promised.

## How the work was sequenced

The plan lived in a Cursor plan file with seventeen tracked todos, worked in
dependency order: schema, crypto, policy engine and tests, audit writer, firmware,
WebSerial, UI shell, Grok, break-glass, actions, delegation, patient view,
dashboard, docs, rehearsal. The agent marked each one in progress and completed as
it went, which kept four people from colliding on the same file.

Two habits did most of the work:

1. **Tests before UI on anything security-shaped.** The policy engine had 16 passing
   assertions — including that treatment and research diverge, and that the crypto
   layer refuses an unauthorized id — before a single page existed. That meant UI
   work could not quietly change an authorization decision.
2. **A smoke test that walks the demo.** `ui/scripts/smoke.mjs` runs all six demo
   scenes against a live server, so "did we break the demo" is one command and not a
   four-minute manual rehearsal.

## Things the agent got wrong, and what fixed them

- Built the in-memory seed at module load, which ran during `next build` and
  demanded a production key. Moved to lazy initialization.
- Left `useSyncExternalStore`-shaped client-only state (`navigator.serial`) in
  render, causing a hydration mismatch. The React lint rules caught it.
- Wrote a self-referential `--font-sans` into the Tailwind theme, which silently
  fell back to a serif face. Caught by looking at a screenshot, which is the
  argument for having the agent take screenshots.
- Logged transformed fields as plainly "seen" in the patient timeline, which
  overstated what a researcher actually saw. Split into a separate "seen only in a
  reduced form" section.
