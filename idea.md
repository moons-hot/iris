PROJECT: Iris

We are building Iris for HopHacks.

I need you to treat everything below as the product/technical specification and help us implement it as a polished hackathon demo. Prioritize a working end-to-end experience over production-scale completeness.

==================================================
1. WHAT IRIS IS
==================================================

Iris is a purpose-bound patient-context system.

The core idea:

Hardware-backed authentication verifies who is accessing the system, role + relationship + task/purpose determine what patient context they should see, sensitive patient data stays encrypted, emergency access is always available through a logged break-glass flow, and patients can see who accessed their information and why.

Simple pitch:

"Most hospital systems ask: Can this employee open the chart?
Iris also asks: Why are they opening it right now, and what do they actually need for that task?"

Another one-line description:

"Iris is a purpose-bound patient-context system: hardware-backed authentication verifies who you are, role and task decide what you see, sensitive data stays encrypted, and patients can see who touched their information."

IMPORTANT DESIGN PRINCIPLE:

Policy authorizes.
AI interprets, extracts, summarizes, redacts, and presents.

The LLM must NOT be the security system.

Do NOT implement:
LLM decides user deserves access -> decrypt everything.

Implement:
user request
-> infer intent/purpose
-> deterministic policy engine
-> select permitted data categories
-> decrypt ONLY those fragments
-> optionally send permitted context to Grok/LLM
-> generate scoped response.

==================================================
2. HACKATHON TRACKS / PRIZES
==================================================

PRIMARY:
Best Healthcare Hack

Track:
Solutions that improve how we deliver, access, or experience care, including empowering patients/providers, access/equity, AI, wearables, digital health, etc.

Our healthcare angle:
- Patients are less afraid of their medical data being unnecessarily exposed.
- Providers get only the context they need for the task they are currently performing.
- Emergency care is never blocked.
- Patients get understandable visibility into who accessed their information.
- Healthcare organizations get strong auditability.

BRAND PRIZE 1:
Auctor - From Conversation to Action

We need conversations to trigger actual operations, not just chatbot answers.

Examples:
Doctor says:
"Create a cardiology handoff."

Iris should:
-> detect purpose
-> evaluate policy
-> pull only relevant permitted data
-> generate a cardiology handoff
-> save it
-> log the action.

Another possible action:
"Give engineering a 30-minute debug view of this failed medication import."

Iris:
-> creates a time-limited scoped delegation
-> engineer authenticates separately
-> gets only the necessary technical context.

BRAND PRIZE 2:
SpaceXAI - Make it Legendary

Requirements:
- Built using Cursor
- Use Grok Imagine OR Grok Voice API
- More Cursor use = better
- Bonus for Grok Bot planning/collaboration

We plan to:
- Build heavily in Cursor
- Use Cursor Origin in addition to GitHub
- Use Grok Voice as part of the actual clinical workflow

Grok Voice should NOT just be decorative speech transcription.

Use Grok Voice for things like:
- clinician asks for patient context
- intent/task extraction
- break-glass reason capture
- voice-generated actions
- optionally spoken responses

Example:
"What do I need to know before prescribing this patient an NSAID?"

Grok interprets:
purpose = treatment
task = medication prescription
requested context = allergies, meds, contraindications

The Iris policy engine then decides what is actually allowed.

BRAND PRIZE 3:
Best Use of Tiger Data

Tiger should be CENTRAL, not just "we used Postgres."

Use Tiger/Postgres for:
- encrypted patient data
- users
- roles
- patient relationships
- devices
- policies
- record fragments
- delegations
- encounters

Most importantly:
Use a Tiger hypertable for access_events.

Every:
- access request
- successful read
- restriction
- denial
- update
- login
- logout
- break-glass
- delegation
- session termination

should generate an event.

Use Tiger continuous aggregates / time-series queries for a live security/accountability dashboard.

==================================================
3. TECH STACK
==================================================

Frontend:
- Next.js
- TypeScript
- Tailwind
- shadcn/ui

Hosting:
- Vercel

Database:
- Tiger Data / PostgreSQL

LLM:
- Grok for hackathon
- Any compatible LLM abstraction is okay if needed

Voice:
- Grok Voice / transcription through the web dashboard

Encryption:
- AES-256-GCM is enough for hackathon
- Encrypt individual record fragments, not just one giant patient JSON blob

Authorization:
- custom RBAC + purpose/context-aware policy engine

Hardware:
- ESP32-S3
- connected to computer through USB
- WebSerial for browser communication

Development:
- Cursor
- Cursor Origin
- GitHub

IMPORTANT:
We are NOT using NFC as the main hardware interaction.

==================================================
4. CORE ARCHITECTURE
==================================================

High-level:

                         IRIS

                 WHO ARE YOU?
                       |
                       v
          Hardware-backed authenticator
                ESP32-S3 / Iris Key
                       |
                       v
              Registered identity
                       |
                       v

                 WHY ARE YOU HERE?
                       |
                       v
         Role + relationship + task/purpose
                       |
                       v
                POLICY ENGINE
            deterministic authorization
                       |
             +---------+---------+
             |                   |
           ALLOW              RESTRICT
             |                   |
             v                   v
    decrypt permitted       do not decrypt
     record fragments      restricted fragments
             |                   |
             +---------+---------+
                       |
                       v
                   GROK / LLM
          shapes permitted context only
                       |
                       v
              PURPOSE-BOUND VIEW


Every important event:
                       |
                       v
                   TIGER DATA
                access-event stream


The core rule:
DO NOT decrypt the entire chart and then give everything to Grok to redact.

That defeats the privacy model because the third-party model already saw the data.

Instead:

request
-> intent/purpose extraction
-> deterministic policy engine
-> identify allowed fragments
-> decrypt only allowed fragments
-> give allowed context to Grok
-> return answer/view.

==================================================
5. PATIENT DATA MODEL
==================================================

Do not store a patient as one giant encrypted text blob if possible.

Store structured fragments.

Example:

patient P1048

fragment:
type = allergy
sensitivity = clinical
encrypted_value = ...
purpose classes = treatment, medication review, emergency

fragment:
type = phone_number
sensitivity = identifier
encrypted_value = ...
purpose classes = scheduling, administration

fragment:
type = psychiatric_note
sensitivity = highly_sensitive
encrypted_value = ...
purpose classes = relevant clinical treatment, emergency

Potential categories:

- name
- DOB
- phone
- address
- insurance
- appointment
- vitals
- allergies
- medications
- diagnoses
- labs
- procedures
- visit reason
- clinical notes
- psychiatric / sensitive notes
- billing
- encounter metadata

One encrypted system of record underneath.

The different screens are "lenses" over that record.

==================================================
6. AUTHENTICATION HARDWARE
==================================================

Every staff user conceptually has their own small Iris hardware authenticator.

DO NOT treat this as:
"possession of a USB literally proves the biological human's identity."

Describe it as:
"hardware-backed authentication verifies a registered credential tied to the user."

Hackathon flow:

Browser connects to ESP32-S3 over WebSerial.

1. User plugs in Iris Key.
2. Backend/browser generates a challenge.
3. ESP32 produces a challenge response using a device-specific secret.
4. Backend verifies the device.
5. Device maps to a registered employee.

Example:

Device IRIS-0042
->
Dr. Maya Chen
->
Physician
->
Cardiology

For hackathon:
A stored provisioned secret is fine.

If we have time:
Explain that a production version would use ESP32-S3 eFuse / hardware HMAC functionality so secrets cannot just be read out like normal application data.

We do NOT need to burn permanent eFuse keys during a hackathon if that makes development risky.

==================================================
7. SESSION PRESENCE / SESSION KILL
==================================================

The hardware should not only authenticate once.

Use it for continued physical presence.

Browser <-> ESP32 heartbeat.

Every few seconds:
browser asks for a signed/valid response.

If:
- USB unplugged
- authenticator stops responding

Then:
- revoke server session
- blank patient data from UI
- close voice interaction
- log SESSION_END / DEVICE_REMOVED in Tiger

UI:

HARDWARE PRESENCE LOST
SESSION TERMINATED

Do not claim that unplugging the device somehow erases something already photographed/copied by the user.

It ends ongoing system access.

==================================================
8. ROLE + PURPOSE-BOUND VIEWS
==================================================

RBAC is the first layer.

Purpose/task/context is the second layer.

WHO + ROLE + RELATIONSHIP + PURPOSE + TASK + REQUESTED DATA + CONTEXT
-> policy result.

Examples:

RECEPTION

Purpose:
check patient in

Allowed:
- name
- DOB
- appointment
- insurance
- contact information

Locked:
- diagnoses
- medications
- clinical notes
- sensitive clinical details


NURSE

Purpose:
prepare patient for current visit

Allowed:
- vitals
- medications
- allergies
- reason for visit
- relevant recent history

Locked:
- billing
- unrelated clinical notes
- unrelated administrative data


DOCTOR

Purpose:
treat active cardiac complaint

Allowed:
- medications
- allergies
- cardiac history
- relevant labs
- previous cardiac procedures

Doctor may also update the patient record.
Any updated data should be encrypted before storage.

Important:
Doctor role alone should NOT automatically mean "load every field in the database."

==================================================
9. MOST IMPORTANT PURPOSE-BOUND DEMO
==================================================

This needs to work beautifully.

SAME DOCTOR.
SAME PATIENT.
SAME ACCOUNT.
DIFFERENT PURPOSE.
DIFFERENT VIEW.

Example A:

Doctor:
"I'm treating Maya's chest pain. Give me the relevant context."

Role:
physician

Purpose:
active treatment

Task:
chest pain evaluation

Return:
- medications
- allergies
- cardiac history
- relevant labs
- prior relevant procedures

Then SAME doctor:

"I'm reviewing Maya's case for a research dataset."

Role:
still physician

Purpose:
research

Task:
outcome analysis

Now return something like:
- Patient P1048
- age range 45-50
- diagnosis category
- treatment
- outcome

Redact:
- name
- phone
- address
- exact DOB
- unrelated notes

This demo is the thesis.

Presentation line:

"Nothing about my identity changed. My purpose did."

==================================================
10. DOCTOR DOCUMENTATION / INGESTION PIPELINE
==================================================

Doctors should be able to record or transcribe a patient visit.

Flow:

doctor + patient conversation
-> browser microphone
-> Grok Voice / transcription
-> structured medical extraction
-> classify fields/fragments
-> encrypt each fragment
-> save to Tiger

The raw transcript does NOT need to be stored forever.

Prefer:
- process audio/transcript
- extract structured note
- store encrypted structured fragments
- optionally discard raw audio

Example:

Encounter E8391

reason_for_visit:
Chest pain

medication:
Warfarin

allergy:
NSAIDs

symptom:
Shortness of breath

clinical_note:
...

Each item gets:
- patient
- encounter
- type
- sensitivity
- purpose categories
- timestamp
- encrypted value

==================================================
11. VOICE / GROK SECURITY
==================================================

For the hackathon:
Use SYNTHETIC patient data.

We will use Grok or another LLM because this is a hackathon.

We should explicitly mention:
A real hospital deployment would require proper healthcare vendor agreements, BAA/HIPAA considerations, retention controls, data residency/security decisions, etc.

Do NOT claim:
"Grok automatically makes us HIPAA compliant."

Do NOT claim:
"This prototype is production HIPAA compliant."

Production story:

Browser / clinical endpoint
-> TLS
-> HIPAA-appropriate transcription provider under proper agreement
OR
-> local/on-prem transcription
-> Iris backend

The web browser microphone is fine for the prototype.

Security rules:
- use HTTPS
- explicit microphone permission
- don't expose permanent LLM API keys in browser
- ideally backend generates short-lived auth/session
- do not send the entire patient chart to the LLM
- do not log sensitive prompts/transcripts in random telemetry
- do not store raw audio by default
- encryption key should not live inside Tiger beside ciphertext in a real implementation
- use synthetic PHI for the hackathon demo

IMPORTANT:
The ESP32 does NOT need to handle the audio.

Use the browser for voice.
Use the ESP32 for the thing it is actually valuable for:
hardware-backed authentication + continued presence + physical confirmation.

==================================================
12. ENGINEER / TECHNICAL ACCESS
==================================================

This is based on the notebook's "tech dude tries to access file" flow, but make it secure and useful.

Problem:
A hospital engineer may need data to debug a real issue.

Example:
"Medication reconciliation is returning duplicate entries."

They need:
- schema
- row shape
- error information
- perhaps representative medication records

They do NOT need:
- patient name
- address
- phone
- unrelated diagnoses
- unrelated notes

Flow:

Engineer plugs in THEIR Iris Key.

Device:
IRIS-ENGINEER-07

Identity:
Alex Kim

Role:
Clinical Systems Engineer

RBAC:
valid employee
valid engineer

Purpose:
debug medication reconciliation

Policy returns:
- schema
- encounter ID
- anonymized patient ID
- relevant medication rows
- technical metadata

Redacts:
- identity
- contact info
- unrelated patient content

Example output:

Patient:
P1048

Medication:
Warfarin

Duplicate rows:
2

Encounter:
E3391

Name:
REDACTED

Address:
REDACTED

Phone:
REDACTED

Unrelated conditions:
REDACTED

We can also generate synthetic/example rows while preserving the shape of the failing dataset.

==================================================
13. DO NOT PHYSICALLY HAND SOMEONE ELSE'S AUTHENTICATOR
==================================================

We initially discussed "physical handoff through ledger."

Do not implement that as:
Doctor physically gives engineer the doctor's identity token.

Instead implement a scoped delegation.

Example:

Doctor authenticates with Doctor Iris Key.

Doctor says:
"Give engineering a 30-minute debugging view for medication reconciliation on encounter E3391."

Iris creates:

Delegation:
recipient role = clinical engineer
scope = medication reconciliation fields
patient = P1048
encounter = E3391
expires = +30 min

Engineer then authenticates with THEIR OWN Iris Key.

If their identity/role matches the delegation:
allowed scoped view becomes available.

This is much safer and cleaner.

==================================================
14. BREAK-GLASS
==================================================

This is CRITICAL.

Do NOT make an LLM decide whether a doctor's emergency is "valid enough."

Do NOT reject an authenticated clinician's authorized break-glass override because the system thinks they use it too often.

Break-glass is about:
ACCESS FIRST IN AN EMERGENCY
ACCOUNTABILITY AFTERWARD

Normal path:
role
+ relationship
+ purpose
+ policy
-> scoped data

Emergency path:

authenticated clinician
-> presses/says BREAK GLASS
-> system asks for reason
-> doctor states reason
-> reason is captured
-> require physical confirmation on Iris hardware if possible
-> restrictions are overridden for the emergency session
-> time-limited emergency access opens
-> Tiger logs everything
-> event is flagged for review
-> compliance/security can be notified

Example:

Doctor:
"Break glass."

Grok:
"State the reason for emergency access."

Doctor:
"Patient is unconscious after a suspected overdose and I need the complete medication history."

Doctor presses physical button on ESP32.

UI:

EMERGENCY ACCESS ACTIVE

Reason:
Suspected overdose, unconscious patient

Access:
Expanded clinical context

Expires:
15:00

This event has been logged and flagged for review.

IMPORTANT:

If the same doctor breaks glass 30 times:
DO NOT disable break-glass.

Instead:
- allow emergency override
- create an anomaly
- flag account/activity
- notify compliance/security
- increase review priority

Break-glass must still work.

Example:

BREAK_GLASS_ALLOWED = true

ALERT:
Unusual break-glass frequency for Dr. Chen.
Compliance review requested.

==================================================
15. TIGER BREAK-GLASS LOG
==================================================

Every event should have structured metadata.

Example:

timestamp:
2026-09-19T03:52:17

actor:
Dr. Maya Chen

actor_id:
DOC-001

device:
IRIS-0042

patient:
P1048

event:
BREAK_GLASS

purpose:
emergency_treatment

reason:
Suspected overdose, unconscious patient

resources:
expanded clinical record

session:
S8191

emergency:
true

Then dashboard updates instantly.

==================================================
16. PATIENT PAGE
==================================================

This is very important for the healthcare track.

Patients should get a human-readable page:

"Who accessed my information?"

NOT a raw IT log.

Example:

Today, 9:42 AM

Dr. Maya Chen
Cardiology

Purpose:
Treating today's chest pain

Viewed:
- medications
- allergies
- cardiac history

Normal access


Today, 10:14 AM

Sarah Kim
Scheduling

Purpose:
Managing upcoming appointment

Viewed:
- name
- contact information
- appointment

Normal access


Today, 11:32 AM

Dr. Maya Chen
Emergency access

Reason:
Patient unconscious during emergency

Viewed:
Expanded clinical record

BREAK-GLASS ACCESS


This page connects the project directly to:
"empowering patients."

Patient should be able to understand:
- who looked
- when
- what category of data they looked at
- why
- whether it was normal or emergency access

==================================================
17. TIGER DATA MODEL
==================================================

Suggested normal tables:

users

devices

patients

encounters

patient_relationships

policies

record_fragments

delegations

sessions

generated_actions / handoffs


Important hypertable:

access_events


Potential access_events fields:

time
event_id
actor_id
actor_role
device_id
patient_id
encounter_id
session_id
purpose
task
resource_type
decision
reason
break_glass
latency_ms
metadata
previous_event_hash
event_hash

Could optionally hash-chain audit events:

event_hash =
hash(previous_event_hash + canonical_event_data)

This gives a "tamper-evident" audit trail.

Use the phrase:
tamper-evident

Do NOT claim:
immutable

unless we actually implement stronger guarantees.

==================================================
18. TIGER ANALYTICS DASHBOARD
==================================================

Create a live hospital/security dashboard.

Example:

ACCESS ACTIVITY TODAY

4,821 requests
4,309 allowed
486 restricted
26 emergency overrides


ACCESS BY PURPOSE

Treatment        71%
Scheduling       12%
Billing           8%
Engineering       4%
Research          3%
Other             2%


BREAK-GLASS ACTIVITY

09:04 - Dr. Chen - ER
11:17 - Dr. Thomas - ICU
13:42 - Dr. Chen - ER


Possible anomaly:

UNUSUAL ACTIVITY

Dr. Chen
8 emergency overrides today
3 different departments

Compliance review recommended

Tiger should update during the live demo as we perform actions.

==================================================
19. GROK TOOL / ACTION DESIGN
==================================================

Give Grok access to narrowly-defined backend tools.

Potential tools:

requestPatientContext()

createClinicalHandoff()

createEngineeringDelegation()

requestBreakGlass()

submitBreakGlassReason()

showAccessHistory()

updatePatientRecord()

explainAccessDecision()


Example:

Doctor says:
"What do I need to know before prescribing an NSAID?"

Grok extracts:

{
  purpose: "treatment",
  task: "medication_prescription",
  requested_context: [
    "medications",
    "allergies",
    "contraindications"
  ]
}

Backend policy engine evaluates it.

Allowed decrypted context might be:

Allergy:
NSAIDs

Medication:
Warfarin

History:
GI bleed

Only THEN should Grok formulate the final answer.

==================================================
20. AUCTOR CONVERSATION -> ACTION
==================================================

Implement at least one excellent action flow.

BEST OPTION:

Doctor:
"Create a cardiology handoff."

Iris:

voice
-> intent detected
-> purpose = specialist handoff
-> policy engine
-> select authorized relevant fragments
-> decrypt those fragments
-> generate handoff
-> save handoff
-> generate audit event

UI:

CARDIOLOGY HANDOFF CREATED

Included:
Presenting complaint
Cardiac history
Medications
Allergies
Relevant labs

Excluded:
7 unrelated fields

Audit event created


This needs to feel like a real action happened.

Not:
"Here's how you could create a handoff."

==================================================
21. USER INTERFACES
==================================================

We likely need these major pages/views:

A. Login / Hardware Authentication
- waiting for Iris Key
- device found
- challenge-response
- identity displayed

B. Provider Dashboard
- patient lookup
- current purpose/task
- role
- visible patient-context cards
- locked/redacted cards
- voice button
- break-glass button
- record/update action
- create handoff action

C. Engineer Dashboard
- authenticated engineer identity
- assigned delegations
- scoped technical view

D. Patient Dashboard
- "Who accessed my information?"
- understandable timeline

E. Admin / Security / Tiger Dashboard
- live access event stream
- access metrics
- purpose metrics
- break-glass events
- anomaly cards

F. Optional Encounter Recorder
- microphone
- live transcript
- structured extracted fields
- save encrypted note

==================================================
22. UI / PRODUCT FEEL
==================================================

We want this to look like an actual modern healthcare/security product.

Use shadcn.

Simple and polished.

Not a giant dashboard full of fake charts.

Important visual states:

GREEN:
allowed

YELLOW:
partial / purpose-limited / redacted

RED:
denied / restricted

PURPLE or strong warning treatment:
break-glass / emergency access

Show WHY something is hidden.

Example:

Psychiatric note
LOCKED

Reason:
Outside current chest-pain treatment context

This is better than silently disappearing data because judges need to see the policy working.

==================================================
23. DEMO DATA
==================================================

Use entirely synthetic data.

Have at least:

PATIENT:
Maya Patel / Patient P1048

Could have:
- name
- DOB
- phone
- address
- insurance
- appointment
- allergies
- medications
- cardiac history
- psychiatric note
- labs
- recent encounter
- billing details
- etc.

STAFF:
Dr. Maya Chen
Role: Physician / Cardiology

Sarah Kim
Role: Reception / Scheduling

Nurse Jordan Lee
Role: Nurse

Alex Kim
Role: Clinical Systems Engineer

PATIENT ACCOUNT:
Maya Patel

Make sure role/task differences are obvious.

==================================================
24. MAIN JUDGE DEMO
==================================================

The demo should tell one continuous story.

SCENE 1 - HARDWARE AUTH

Start locked.

Plug in ESP32 Iris Key.

UI:

IRIS KEY CONNECTED
Authenticating...

Dr. Maya Chen
Cardiology

Authenticated


SCENE 2 - PURPOSE-BOUND DATA

Doctor asks by voice:

"I'm evaluating Maya's chest pain. Show me what matters."

System shows:
- medications
- allergies
- cardiac history
- relevant labs

Then SAME doctor says:

"I'm reviewing this patient's outcome for a research dataset."

Now:
Maya Patel -> Patient P1048
DOB -> Age 45-50
Address -> REDACTED
Phone -> REDACTED
Relevant outcomes -> visible

Presentation line:

"Nothing about my identity changed. My purpose did."


SCENE 3 - CONVERSATION TO ACTION

Doctor says:

"Create a cardiology handoff."

System visibly shows:

Purpose detected
->
Policy evaluated
->
5 relevant fields authorized
->
7 unrelated fields excluded
->
Handoff created

This hits Grok + Auctor.


SCENE 4 - BREAK GLASS

Doctor tries to access data outside current context.

UI:

This information is outside your current care context.

[BREAK GLASS]

Doctor says:

"Break glass."

Grok:
"State the emergency reason."

Doctor:
"Patient became unconscious after a suspected overdose and I need the complete medication history."

Doctor physically presses button on ESP32.

UI:

EMERGENCY ACCESS ACTIVE

Full relevant emergency clinical context available

15:00 remaining

This event has been logged and flagged for review.


SCENE 5 - TIGER DASHBOARD

Immediately show Tiger-powered dashboard.

A new event appears:

BREAK_GLASS

Dr. Maya Chen
Patient P1048
Emergency treatment
03:48:12 AM

Show live counts update.


SCENE 6 - PATIENT

Switch to patient view.

"Who accessed my information?"

Show the doctor access, normal accesses, and the emergency event in understandable language.

Ending line:

"Iris doesn't try to stop clinicians from caring for patients. It makes normal access contextual, emergency access frictionless, and every use of patient data accountable."

==================================================
25. IMPORTANT PRODUCT RULES
==================================================

1. AI NEVER makes the final authorization decision.

2. Policy engine determines allowed data.

3. Only permitted fragments should be decrypted for normal access.

4. Grok should only receive the minimum context needed for the task.

5. Break-glass by an appropriately authenticated clinician should not be denied because the AI dislikes the reason.

6. Repeated break-glass generates alerts/investigation, not disabled emergency care.

7. Each employee has their own identity/authenticator.

8. Delegation is scoped authorization between users, not sharing authentication hardware.

9. Use synthetic patient data for the hackathon.

10. Do not claim this hackathon prototype is HIPAA compliant.

11. Mention production deployment would need appropriate BAA/vendor/compliance setup.

12. Patient data should be encrypted before storage.

13. Use one underlying encrypted record with purpose-bound views.

14. Patients should see meaningful access history in plain English.

15. Hardware should have a real purpose:
authentication + continued presence + physical confirmation.

==================================================
26. IMPLEMENTATION PRIORITY
==================================================

BUILD IN THIS ORDER:

P0:
Tiger schema
synthetic patient
users
roles
record fragments
access_events
basic encryption

P0:
policy engine

P0:
doctor dashboard with different views based on role/purpose

P0:
same doctor + same patient + different purpose demo

P1:
ESP32 WebSerial challenge-response authentication

P1:
hardware-presence heartbeat / unplug session kill

P1:
Grok Voice / browser microphone

P1:
voice -> purpose/task extraction -> backend policy

P1:
break-glass
reason capture
physical confirmation
Tiger event

P1:
patient access-history page

P1:
live Tiger analytics dashboard

P2:
doctor conversation ingestion / structured note extraction

P2:
clinical handoff generation

P2:
engineer scoped delegation flow

P3:
extra polish / anomaly detection / hash-chained logs

DO NOT spend half the hackathon trying to make the ESP32 stream microphone audio.

Browser owns audio.

ESP32 owns authentication/presence/physical confirmation.

==================================================
27. SECURITY / DEMO REALISM
==================================================

This needs to survive basic questioning from security/healthcare judges.

Do not overclaim.

Correct framing:

"Hardware-backed credential"
not
"This device proves biologically that this person is Dr. Chen."

"Purpose-aware privacy and governance layer"
not
"HIPAA legally requires exactly this access model."

"Tamper-evident audit trail"
not
"Mathematically immutable database."

"Production deployment would require appropriate BAA/HIPAA infrastructure"
not
"Grok makes this HIPAA compliant."

"Emergency access is logged and investigated"
not
"AI determines whether a doctor really deserves emergency access."

==================================================
28. WHAT MAKES IRIS UNIQUE
==================================================

The interesting piece is NOT simply:

AI + RBAC + encrypted database.

The idea is:

RBAC answers:
"What broad powers does this employee have?"

Iris adds:
"What are they doing right now?"

That creates purpose-bound views.

Same identity.
Same role.
Same patient.
Different task.
Different context.

Then Iris adds:

hardware-backed identity
+
continued physical presence
+
encrypted fragments
+
purpose-aware access
+
AI-generated scoped views
+
conversation-to-action
+
unblockable but accountable emergency access
+
patient-visible transparency
+
Tiger-powered temporal auditing.

That is the product.

==================================================
29. CURRENT PROJECT NAME
==================================================

The project is called:

IRIS

Use Iris consistently throughout the UI, codebase, README, demo data, and branding.

Potential product terminology:

Iris Key
= ESP32 hardware authenticator

Iris Lens
= purpose-bound view of patient information

Iris Audit
= access history / Tiger event system

Do not spend significant time branding unless the core implementation is already working.

==================================================
30. FINAL GOAL
==================================================

The most important end-to-end interaction we need working is:

plug in Iris Key
->
authenticate clinician
->
open patient
->
doctor asks a question by voice
->
Grok extracts purpose/task
->
our policy engine selects allowed fragments
->
only those fragments are decrypted
->
Grok generates a useful scoped answer
->
Tiger logs access
->
doctor changes purpose
->
visible data changes
->
doctor invokes break-glass
->
states reason
->
physically confirms
->
expanded access opens immediately
->
Tiger dashboard updates
->
patient can later see the emergency access event

If tradeoffs are necessary, prioritize making this flow flawless.