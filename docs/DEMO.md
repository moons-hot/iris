# Iris demo script

Six scenes, roughly four minutes. The API path behind every step is exercised by
`node ui/scripts/smoke.mjs <baseUrl>`, so if the smoke test is green the demo path
is intact.

## Before you start

- Two browser windows: **Iris** on the presenting screen, **/security** on the
  second screen so judges watch the counters move. `/security` is reachable by URL
  only — it is deliberately not in the navigation, because it is the auditor's
  view and the clinician never opens it.
- The board plugged in, or the two demo keys ready as the fallback. The login
  screen offers one doctor and one patient; they are separate accounts and you
  end one session to start the other.
- `pnpm dev` running.
- **Restart the server right before you present.** Rehearsals leave live
  break-glass windows behind, and a purple banner counting down on a patient you
  have not introduced yet is a question you do not want to answer on stage.
- Have `/patient` open in a third tab for scene 6.

## Scene 1 — The key is the login (25s)

Plug in `IRIS-0042`, click **Connect**.

> "There is no password. This board answers a challenge from the server with an
> HMAC over a secret it never reveals. The browser only carries the message."

The strip turns green. You land on Dr. Maya Chen's patient list.

**Then unplug the board.** The screen clears within eight seconds and logs
`DEVICE_REMOVED`.

> "Presence is part of the session, not just the login."

Plug it back in.

## Scene 2 — Your patients, and everyone else's (40s)

Eight patients, each with the reason they are in today. Type `silva` — two rows.

Now type `osei`.

> "Daniel Osei is in this hospital. He is not Dr. Chen's patient, so she gets one
> line: a record matched. No name, no date of birth, nothing. The match happened
> on the server and the name never left it."

Leave the row on screen; scene 5 comes back to it.

## Scene 3 — Same doctor, same patient, different purpose (60s)

Open **Maya Patel**. Press the mic and say:

> "I'm evaluating Maya's chest pain, show me what matters."

Grok extracts purpose `treatment`, task `chest_pain_evaluation`. Twelve fields
open: vitals, allergies, medications, cardiac history, labs, the cardiology note.
Eight stay closed.

Click **8 fields withheld for this purpose** and point at the behavioural health
note.

> "That is not hidden because of her role. It is hidden because of what she is
> doing right now."

Now click **Research**. Nothing else changes.

> "Same account. Same patient. Only the purpose changed."

The name becomes `Patient P1048`, the birth date becomes `Age 45-50`, and the
diagnosis carries a **Redacted** chip. Contact details and notes drop out entirely.

> "Research does not get denied — it gets a reduced view. That is the difference
> between a permission system and a purpose system."

## Scene 4 — Conversation to action (35s)

Back on Treatment, say:

> "Create a cardiology handoff for this patient."

A handoff artifact is generated and saved, with the counts shown: twelve authorized
fields included, eight excluded.

> "The handoff physically cannot contain the fields this purpose never opened."

## Scene 5 — Break glass (60s)

Go back to the list, search `osei` again, and click **Break glass** on the
unnamed row. **Press the button on the board** (or confirm on the demo key).

> "Access opens first. No cooldown, no second opinion — slowing this down is the
> one failure mode we refuse to have."

Then record the reason in the dialog:

> "Patient collapsed in the corridor, no chart and no next of kin."

Click **Save reason**. The dialog closes.

Daniel Osei's name appears on the row. Open his chart: the purple banner is
pinned to the top, counting down from fifteen minutes, with the reason she gave
printed next to it. Scroll — the banner stays.

Point at the second screen: the override has already appeared, and the anomaly card
now flags repeated overrides across departments.

> "That is a review flag, not a block. Frequency changes review priority, never
> availability."

## Scene 6 — The patient's view (35s)

Click **End session**, then sign in with the **Patient - Maya Patel** demo key.
The navigation changes: there is no patient list any more, only "My access".

> "This is a different account, not a different tab. A doctor's key cannot open
> this screen and this card cannot open a chart — and that is enforced in the
> API, not just in the menu. The record is picked by the credential; there is no
> patient id in the request to change."

> "Same audit stream the security team sees, different language. One sentence per
> access, and the emergencies are at the top. Dr. Chen opened her record for
> emergency care, and this is the reason she gave — word for word, because a
> paraphrased reason is a changed reason."

## Close

> "Iris is a purpose-bound patient-context system. Hardware proves a credential is
> present. A deterministic policy engine decides what the current task justifies.
> Only those fields get decrypted. Grok interprets and presents, and never decides.
> Emergencies are never blocked, and patients can see everything. Synthetic data,
> and production would need proper BAA infrastructure — but the access model is the
> part we are actually proposing."

## If something breaks

| Failure               | Fallback                                                            |
| --------------------- | ------------------------------------------------------------------- |
| Board not detected    | Use a demo key; events are tagged `simulated`                        |
| Wrong account on screen | End the session and sign in with the other demo key                |
| Voice not working     | Type the same sentence into the panel — identical pipeline            |
| Grok key dead         | Deterministic intent classifier and template summaries take over     |
| Tiger unreachable     | Unset `DATABASE_URL`; the in-memory store is seeded identically      |
| Dashboard looks empty | Re-run `pnpm db:seed`, or unset `DATABASE_URL` and restart           |
