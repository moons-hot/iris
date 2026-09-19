# Iris demo script

Six scenes, roughly four minutes. Every step below is exercised by
`node ui/scripts/smoke.mjs <baseUrl>`, so if the smoke test is green the demo path
is intact.

## Before you start

- Two browser windows: **Iris Lens** on the presenting screen, **/security** on the
  second screen so judges watch the counters move.
- Both boards plugged in, or simulated keys ready as the fallback.
- `pnpm dev` running. Confirm the header says Tiger Data if you are demoing the
  Tiger path.
- **Restart the server right before you present.** Rehearsals leave live
  delegations and break-glass windows behind, and "6 active delegations" on the
  engineer page is a question you do not want to answer on stage.
- Have `/patient` open in a third tab for scene 6.

## Scene 1 — The key is the login (30s)

Plug in `IRIS-0042`, click **Connect Iris Key over USB**.

> "There is no password. This board answers a challenge from the server with an
> HMAC over a secret it never reveals. The browser only carries the message."

The strip turns green. You land on the Iris Lens as Dr. Maya Chen.

**Then unplug the board.** The screen clears within eight seconds and logs
`DEVICE_REMOVED`.

> "Presence is part of the session, not just the login."

Plug it back in.

## Scene 2 — Same doctor, same patient, different purpose (60s)

Press **Voice** and say:

> "I'm evaluating Maya's chest pain, show me what matters."

Grok extracts purpose `treatment`, task `chest_pain_evaluation`. Twelve fields
open: vitals, allergies, medications, cardiac history, labs, the cardiology note.
Eight stay locked, each with a reason.

Point at the locked behavioural health note.

> "That is not hidden because of her role. It is hidden because of what she is
> doing right now."

Now click **Research**. Nothing else changes.

> "Same account. Same patient. Only the purpose changed."

The name becomes `Patient P1048`, the birth date becomes `Age 45-50`, the diagnosis
becomes a category. Contact details and notes drop out entirely.

> "Research does not get denied — it gets a reduced view. That is the difference
> between a permission system and a purpose system."

## Scene 3 — Conversation to action (40s)

Say:

> "Create a cardiology handoff for this patient."

A handoff artifact is generated and saved, with the counts shown: twelve authorized
fields included, eight excluded.

> "The handoff physically cannot contain the fields this purpose never opened."

## Scene 4 — Break glass (60s)

Say:

> "Break glass. The patient became unconscious after a suspected overdose and I
> need the complete medication history."

Iris asks for the reason, captures it, then waits.

**Press the button on the board.** The strip pulses purple, the UI turns purple, and
the behavioural health note opens along with the full medication list.

> "Iris did not decide whether the emergency was real. It gave her access, took the
> reason, and made the access impossible to hide. Billing is still closed, because
> an emergency is clinical, not financial."

Point at the second screen: the override has already appeared, and the anomaly card
now flags repeated overrides across departments.

> "That is a review flag, not a block. Frequency changes review priority, never
> availability."

## Scene 5 — Scoped delegation (45s)

Click **Grant engineering view** — a 30-minute scope for the medication
reconciliation fault.

Swap to the second board, `IRIS-ENGINEER-07`, and go to **/engineer**. Open the
scoped view.

> "Alex is a real engineer with his own credential, and his role grants him nothing
> on its own. He sees the system diagnostics, the encounter metadata, and the shape
> of the medication rows — `string(18) "W•••••••••"`. Enough to find a duplicate-row
> bug. Not enough to learn what she takes. It expires by itself in 30 minutes."

## Scene 6 — The patient's view (30s)

Open **/patient**.

> "Same audit stream the security team sees, different language. No hashes, no field
> names. Dr. Chen opened her record for emergency care at this time, and here is the
> reason she gave. Thirteen fields were withheld from the research access, and her
> name was only ever a study code there."

## Close

> "Iris is a purpose-bound patient-context system. Hardware proves a credential is
> present. A deterministic policy engine decides what the current task justifies.
> Only those fields get decrypted. Grok interprets and presents, and never decides.
> Emergencies are never blocked, and patients can see everything. Synthetic data,
> and production would need proper BAA infrastructure — but the access model is the
> part we are actually proposing."

## If something breaks

| Failure              | Fallback                                                             |
| -------------------- | -------------------------------------------------------------------- |
| Board not detected   | Use a simulated key on the home page; events are tagged `simulated`   |
| Voice not working    | Type the same sentence into the Ask box — identical pipeline           |
| Grok key dead        | Deterministic intent classifier and template summaries take over      |
| Tiger unreachable    | Unset `DATABASE_URL`; the in-memory store is seeded identically       |
| Dashboard looks empty| Check the store badge in the header, then re-run `pnpm db:seed`       |
