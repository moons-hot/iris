Project: MED-1
Autonomous Medical Investigation for Deep-Space Crews
MED-1 helps astronauts investigate unexpected health changes when professional medical support is delayed or unavailable. It combines live crew measurements, personal health baselines, spacecraft telemetry, real space-environment data, and historical spaceflight biology to determine what has changed, what additional measurements are useful, and when to escalate to the ground medical team.

1. The actual problem
Long-duration spaceflight creates a healthcare problem that is fundamentally different from healthcare on Earth.
On Earth:
Something feels wrong
        ↓
Take measurements
        ↓
See a doctor
        ↓
Doctor orders tests
        ↓
Diagnosis / treatment
On a Mars/deep-space mission:
Something feels wrong
        ↓
Astronaut must initially investigate it
        ↓
Medical expertise may be far away
        ↓
Communication has significant delay
        ↓
No easy evacuation
        ↓
Limited medical equipment
        ↓
Astronaut needs decision support
NASA's OSDR and human-spaceflight research explicitly focus on physiological, behavioral, biomedical and environmental changes caused by spaceflight, while NASA's medical-operations work includes longitudinal health surveillance and crew medical support.
Our specific problem
We're not trying to build:
"AI doctor for astronauts."
We're solving:
How can an astronaut determine whether an unexpected health change is meaningful, figure out what information to collect next, and give the ground medical team useful evidence when Earth may be many minutes away?
That is the core product.

2. The product
MED-1 has three layers:
Layer 1: Physical medical station
ESP32 + available sensors + display + NFC.
This is the astronaut's physical interface.
Layer 2: Mission health system
Next.js/Vercel application containing:
astronaut health history
personal baselines
live measurements
spacecraft telemetry
space-environment data
historical spaceflight relationships
investigation state
Layer 3: Grok medical reasoning interface
Grok Voice + Grok API acts as the conversational/decision layer.
It can:
talk to the astronaut
ask questions
request specific measurements
request authorized health information
query spacecraft data
query space-environment data
determine what information is still missing
generate a structured handoff to Earth

3. The entire data pipeline
This is the architecture I'd actually build.
                        HISTORICAL DATA
                              │
             ┌────────────────┼────────────────┐
             │                │                │
           NASA OSDR       NASA RadLab       NASA EDA
             │                │                │
       health/biology      radiation        ISS telemetry
       spaceflight         exposure         CO₂/temp/etc.
             │                │                │
             └────────────────┼────────────────┘
                              │
                              ▼
                    HISTORICAL ANALYSIS
                              │
                  relationships / baselines
                              │
                              ▼
                     ┌────────────────┐
                     │ KNOWLEDGE LAYER │
                     └───────┬────────┘
                             │
                             │
 LIVE MISSION DATA            │
 ───────────────              │
                             │
 ESP32 ──► measurements       │
                             │
 Space environment ───────────┤
                             │
 Astronaut health record ─────┤
                             │
 Spacecraft telemetry ────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │ NORMALIZATION /  │
                   │ CONTEXT ENGINE   │
                   └────────┬─────────┘
                            │
                            ▼
                  PERSONAL BASELINE ENGINE
                            │
                            ▼
                   ┌──────────────────┐
                   │  MED-1 REASONER  │
                   │     + GROK       │
                   └────────┬─────────┘
                            │
                 ┌──────────┼───────────┐
                 ▼          ▼           ▼
             ask crew   read sensor   query data
                 │          │           │
                 └──────────┼───────────┘
                            │
                            ▼
                    NEW EVIDENCE
                            │
                            ▼
                  INVESTIGATION LOOP
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
              continue             escalate
            investigation        to Earth
                  │                   │
                  └─────────┬─────────┘
                            ▼
                    MEDICAL HANDOFF
That loop is the important part.

4. Historical data: NASA OSDR
This is where OSDR becomes extremely valuable.
NASA's Open Science Data Repository isn't just a genomics database. NASA describes OSDR as containing:
physiological data
phenotypic data
behavioral data
biomedical data
environmental telemetry
hardware data
omics
imaging
video
human and animal spaceflight studies
and provides APIs for programmatic access.
So we can use OSDR as our historical space-health research layer.
Most important datasets
Inspiration4 human data
This is particularly useful because it is actual human commercial astronaut data.
NASA's OSDR has publicly available processed biological data from the four-person Inspiration4 mission. The mission collected samples before, during and after flight.
For example, OSD-575 contains pre/post-flight blood-serum measurements including metabolic and immune/cardiovascular biomarkers.
OSD-656 contains 203 inflammatory, cytokine and chemokine proteins from urine samples collected before and after flight.
These give us examples of:
spaceflight
    ↓
biological change
    ↓
measurable health marker

5. But OSDR isn't just humans
This is important.
We should not claim:
"We trained an AI on OSDR and now it knows what radiation does to astronauts."
That's scientifically weak.
A huge amount of OSDR is actually model-organism data. NASA explicitly says most OSDR data historically came from plants, microbes and non-human animals, although human datasets are increasingly available.
That's actually useful for our project if we use it correctly.
For example:
Spaceflight / radiation
          ↓
animal / tissue studies
          ↓
observed biological pathways
          ↓
known spaceflight health effects
Then human astronaut datasets provide a separate layer of evidence.
We use historical data to establish context and relationships, not to pretend we've built a clinically validated diagnostic model.

6. Space/environmental data
This is where I think our project gets particularly strong.
We don't have to find some random NASA CSV.
NASA OSDR itself already provides space-environment telemetry.
NASA Environmental Data Application
The OSDR Environmental Data App contains ISS:
temperature
CO₂
relative humidity
hardware environmental telemetry
radiation data
and allows mission-by-mission comparison.
So:
NASA EDA
   │
   ├── CO₂
   ├── temperature
   ├── humidity
   └── radiation
can feed our environmental context engine.

7. Radiation: NASA RadLab
This is even better.
NASA's RadLab has a programmatic API for radiation telemetry.
It exposes fields such as:
timestamp
absorbed dose rate
dose-equivalent rate
particle flux
spacecraft
instrument
latitude
longitude
altitude
magnetic-field-related parameters
and can return JSON/CSV/TSV.
So our backend can literally make something like:
GET RadLab

mission = ISS
time = last 24 hours

→ radiation dose
→ particle flux
→ timestamp
→ location
Then normalize it into our mission context.
This means we have real space data entering our application programmatically, rather than manually downloading a spreadsheet.

8. The three historical/live data categories
I would make this distinction very clear to judges.
Data
Purpose
OSDR biological/health data
Learn what physiological/biological changes have been observed during spaceflight
OSDR EDA telemetry
Understand spacecraft environmental conditions
OSDR RadLab
Understand radiation exposure/environment
Live ESP32 measurements
Simulate the astronaut's current health/environment
Astronaut personal history
Establish individual baseline
Grok conversation
Collect symptoms/context that sensors can't measure

So we're not pretending one dataset does everything.
We're building a multi-source evidence system.

9. How do we actually find relationships?
This is the part we need to be careful with.
I would not make the core claim:
"Our ML model discovers that radiation causes elevated heart rate."
We don't have enough clean astronaut data to responsibly make that claim.
Instead, use a two-stage relationship engine.
Stage 1: Historical evidence discovery
Use OSDR to identify documented relationships such as:
spaceflight
   ↓
muscle changes
bone changes
immune changes
cardiovascular changes
visual changes
etc.
For example, OSDR studies contain documented spaceflight-related muscle, bone, immune and cardiovascular effects.
We can encode these as evidence relationships.
Example:
SPACEFLIGHT
   │
   ├── associated with → immune changes
   ├── associated with → cardiovascular changes
   ├── associated with → bone loss
   └── associated with → visual changes
Each relationship stores:
source
study
population/model
measurement
confidence/evidence type
So Grok can say:
"This finding has been observed in prior spaceflight research."
rather than inventing causality.

10. Stage 2: Live astronaut deviation detection
This is where our own system does something new.
Suppose astronaut A has:
Resting HR baseline:
61 ± 5 BPM
MED-1 receives:
Current:
82 BPM
We calculate:
z = (82 - baseline_mean) / baseline_std
and determine that the value is significantly outside the astronaut's normal range.
Then we don't immediately diagnose.
We ask:
What other evidence should we collect?
HR elevated
    │
    ├── Is SpO₂ abnormal?
    ├── Is temperature abnormal?
    ├── Is sleep significantly reduced?
    ├── Is exercise load unusual?
    ├── Are there symptoms?
    ├── Is spacecraft environment abnormal?
    └── Is space/radiation environment unusual?
This is where Grok becomes the investigation orchestrator.

11. The relationship engine
I'd have a backend service that creates a context vector around every event.
Something like:
EVENT
─────
Astronaut: A02
Time: Mission Day 143

HEALTH
──────
HR: +2.8 SD from baseline
SpO₂: normal
temperature: normal
sleep: -31%
exercise: normal

SPACECRAFT
───────────
CO₂: elevated
temperature: normal
humidity: normal

SPACE
─────
radiation: elevated vs recent baseline
solar activity: elevated

HISTORICAL
──────────
Relevant spaceflight evidence:
cardiovascular / immune / etc.
Then we calculate relationships between variables.
For continuous data:
Pearson/Spearman correlation
lagged correlation
rolling correlations
anomaly overlap
For example:
radiation anomaly
       │
       │ lag 6h
       ▼
health anomaly
or:
CO₂ anomaly
       │
       │ lag 2h
       ▼
multiple crew symptom reports
The important thing is:
correlation is a signal for investigation, not a diagnosis.
If we see something interesting, MED-1 says:
"This environmental change coincides with the health deviation."
Not:
"Radiation caused your symptoms."
That's much more defensible.

12. The most interesting relationship: individual vs crew
This is where I think the demo becomes really good.
Suppose:
Astronaut A
Headache
HR +20%
MED-1 initially investigates individual health.
But then:
Astronaut B
Headache
Now the system notices:
2 / 4 crew reporting similar symptoms
So the reasoning changes.
Instead of:
PERSONAL HEALTH INVESTIGATION
it switches to:
SHARED ENVIRONMENT INVESTIGATION
and checks:
CO₂
temperature
humidity
pressure
radiation
recent spacecraft events
That is a genuinely intelligent workflow.

13. Full example
Let's make this our actual demo storyline.
Mission
MARS TRANSIT

Mission Day: 148
Crew: 4
Earth communication delay: simulated
Astronaut taps their NFC badge.
CREW MEMBER 02
Baseline loaded
They speak to MED-1 using Grok Voice:
"I've been feeling dizzy and have a headache."

Step 1: Grok structures the report
SYMPTOMS
✓ dizziness
✓ headache

ONSET
~1 hour ago

SEVERITY
moderate

ADDITIONAL DATA
unknown
Grok doesn't diagnose.
It starts an investigation.

Step 2: Get personal baseline
Backend:
get_baseline(A02)
returns:
Resting HR: 62 ± 5
SpO₂: 97–99%
Temperature: 36.6–37.1°C

Step 3: Ask the physical station for measurements
Grok says:
"Let's take a resting heart-rate measurement."
The ESP32 changes its display:
RESTING HEART RATE

Remain still.

Place finger on sensor.
Sensor returns:
HR = 84
Backend calculates:
+4.4 SD from personal baseline
Flagged.

Step 4: Next measurement
Grok decides:
We need oxygen saturation and temperature.
Physical station runs those measurements.
Suppose:
SpO₂ = 98%
Temp = normal
So now:
HR abnormal
SpO₂ normal
temperature normal

Step 5: Pull spacecraft data
MED-1 queries the spacecraft telemetry layer.
CO₂ = elevated
Temperature = normal
Humidity = normal

Step 6: Pull space data
Backend queries NASA RadLab/environmental data for the simulated mission context.
Recent radiation exposure:
above recent mission baseline
Now the system has:
PERSON
HR abnormal

SPACECRAFT
CO₂ elevated

SPACE
radiation elevated

SYMPTOMS
headache + dizziness

Step 7: Historical evidence
The evidence layer searches the curated OSDR knowledge base.
It finds relevant spaceflight literature/data associated with the observed physiological category.
It doesn't say:
"Radiation caused this."
Instead:
RELEVANT PRIOR EVIDENCE

Spaceflight research has documented
cardiovascular / physiological changes
under spaceflight conditions.

Evidence source:
NASA OSDR studies

Relationship:
spaceflight ↔ physiological changes

Causality:
not established for this event

Step 8: Second astronaut reports symptoms
Astronaut 03 walks up.
NFC:
CREW MEMBER 03
They say:
"I've got a headache too."
Now MED-1 detects:
2 / 4 crew affected
That dramatically changes the investigation.

Step 9: System switches hypotheses
INDIVIDUAL EVENT
       ↓
SHARED CREW EVENT?
       ↓
CHECK ENVIRONMENT
MED-1 prioritizes spacecraft telemetry.
CO₂ is abnormal.
Now the system says:
SHARED ENVIRONMENT SIGNAL

2 crew members report
similar symptoms.

Environmental telemetry shows
elevated CO₂.

Further environmental investigation
recommended.
That's a much more compelling result than:
"Your heart rate is 84."

Step 10: Ground handoff
Finally, MED-1 generates:
MEDICAL EVENT SUMMARY

Crew:
A02, A03

Symptoms:
headache, dizziness

Measurements:
A02 HR: 84 BPM
A02 SpO₂: 98%
A02 temperature: normal

Environmental:
CO₂ elevated

Space environment:
radiation above recent baseline

Crew prevalence:
2 / 4

Actions performed:
resting HR
SpO₂
temperature
environmental telemetry check

Outstanding:
ground medical review
And because we're simulating deep space:
GROUND COMMUNICATION

Message queued.

Estimated one-way delay:
XX minutes
Now the Earth team receives something useful instead of:
"Astronaut feels bad."

14. Where Grok fits
We need Grok to be fundamental, not sponsor decoration.
Grok Voice
Used for:
symptom reporting
hands-free interaction
asking follow-up questions
guiding physical tests
communicating results
Grok API/tool calling
Grok gets tools such as:
get_astronaut_baseline()
get_health_history()
read_sensor()
get_spacecraft_telemetry()
get_radiation_data()
get_spaceflight_evidence()
start_measurement_procedure()
create_ground_handoff()
The model chooses which tool to call.
That's the interesting AI component.
Grok Imagine
We can use Imagine for the mission visualization / medical event reconstruction rather than generating fake medical images.
For example, after the investigation:
Generate a visual representation of the spacecraft/environment event for crew briefing.
But I would make Grok Voice + tool orchestration the core. Imagine should be supplementary if the API gives us something genuinely useful.

15. Where Cursor fits
The SpaceX track explicitly requires Cursor.
So we should actually build the entire application through Cursor and make that part of the development process.
Potentially use Grok Bot for:
architecture planning
API design
debugging discussions
dataset exploration
test generation
task decomposition
But the actual product should demonstrate that Cursor was heavily used to build it, not just that we opened Cursor once.

16. How we hit the SpaceX track
Requirement 1: Real space data
Absolutely.
We're using NASA:
OSDR Biological Data API
 Historical space biology/health data.
OSDR Environmental Data Application
 ISS environmental telemetry and radiation.
OSDR RadLab API
 Actual radiation telemetry, including dose rate, flux and timestamped measurements.
So space data is directly in our reasoning pipeline.
Requirement 2: Grok
Core functionality:
Grok Voice → astronaut → investigation
Grok API → adaptive tool calling/reasoning
Requirement 3: Cursor
Build the application heavily in Cursor.
Bonus: Grok Bot
Use Grok Bot throughout the development/planning process and document that workflow.
Most importantly:
Space isn't just the theme.
If you remove:
radiation
spacecraft telemetry
spaceflight evidence
astronaut-specific health constraints
the product fundamentally changes.
That's what we want.

17. How we hit Best Healthcare Hack
The healthcare problem is:
How do you deliver meaningful medical decision support when the patient is also the person responsible for initiating their own evaluation and professional care is delayed?
We're improving:
Access
Medical support isn't immediately available.
MED-1 provides structured first-line investigation.
Delivery
It turns raw symptoms and measurements into a structured medical event.
Patient experience
The astronaut can simply talk:
"I don't feel right."
rather than navigating a medical dashboard.
Provider experience
The ground team receives:
symptoms
+
measurements
+
baseline deviations
+
environment
+
actions already taken
+
remaining questions
rather than raw telemetry.
That's a meaningful healthcare workflow.

18. The final architecture
I'd use something like:
                      ┌──────────────────────┐
                       │      NASA OSDR       │
                       │                      │
                       │ Biological data      │
                       │ Physiological data   │
                       │ Spaceflight studies  │
                       └──────────┬───────────┘
                                  │
                       ┌──────────▼───────────┐
                       │ Historical Evidence  │
                       │      Engine          │
                       └──────────┬───────────┘
                                  │
 ┌────────────────┐               │              ┌─────────────────┐
 │ NASA RadLab    │───────────────┤              │ NASA EDA        │
 │ Radiation      │               │              │ ISS telemetry   │
 └────────────────┘               │              └────────┬────────┘
                                  │                       │
                                  ▼                       │
                         ┌─────────────────┐              │
                         │ Context Engine  │◄─────────────┘
                         └────────┬────────┘
                                  │
       ┌──────────────────────────┼──────────────────────┐
       │                          │                      │
       ▼                          ▼                      ▼
┌─────────────┐          ┌────────────────┐       ┌─────────────┐
│ ESP32       │          │ Astronaut      │       │ Personal    │
│ Medical Kit │          │ Health Record  │       │ Baselines   │
└──────┬──────┘          └───────┬────────┘       └──────┬──────┘
       │                         │                       │
       └─────────────────────────┼───────────────────────┘
                                 │
                                 ▼
                      ┌─────────────────────┐
                      │     MED-1 ENGINE    │
                      │                     │
                      │ anomaly detection   │
                      │ evidence retrieval  │
                      │ investigation state │
                      │ correlation engine  │
                      └──────────┬──────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    GROK API     │
                        │                 │
                        │ Voice           │
                        │ Tool calling    │
                        │ Reasoning       │
                        └────────┬────────┘
                                 │
                     ┌───────────┼────────────┐
                     ▼           ▼            ▼
                  ASK CREW   RUN TEST    QUERY DATA
                     │           │            │
                     └───────────┼────────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │ Investigation    │
                       │      Loop        │
                       └────────┬─────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
                Continue                Escalate
                testing               to Earth
                    │                       │
                    └───────────┬───────────┘
                                ▼
                       Ground Medical Report
And the web stack:
Next.js
   │
   ├── App Router
   ├── TypeScript
   ├── Tailwind
   └── WebSocket/live state

Vercel
   │
   ├── deployment
   ├── serverless/API routes
   └── database infrastructure

ESP32
   │
   ├── sensors
   ├── NFC
   ├── display
   └── physical procedure control

Grok
   │
   ├── Voice
   ├── tool calling
   └── Imagine

NASA
   │
   ├── OSDR
   ├── RadLab
   └── EDA

19. The key thing we should NOT claim
This is important for the pitch.
We're not saying:
"Our AI can diagnose astronauts."
We're saying:
MED-1 helps astronauts investigate health anomalies by combining personal baselines, physical measurements, spacecraft telemetry, real space-environment data, and historical spaceflight evidence.
And:
It identifies relationships and deviations that warrant further investigation; it does not establish medical causation or replace a flight surgeon.
That actually makes the project more credible.
