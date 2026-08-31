# Shift Sync — Backend & ML Service

An AI-augmented shift management platform for hourly staff. Handles fraud-resistant clock-ins, natural-language shift requests, and machine-learning-driven shift coverage matching.

Built as the dissertation project for an MSc in Computing at Griffith College Dublin.

**Frontend:** [Shift_Sync_Frontend](https://github.com/NikhilBabu829/Shift_Sync_Frontend)

> **Status:** Alpha / prototype. Core logic is complete and working; see [Known limitations](#known-limitations) before running it anywhere real.

---

## The problem

Hourly shift work has two persistent problems that most rota software doesn't solve.

**Clock-in fraud.** Staff clock in for each other, or clock in from a car park without entering the building. GPS alone doesn't catch it, because a phone sitting in the right place tells you nothing about who is holding it.

**Coordination overhead.** When someone calls in sick, a manager manually works out who is available, who is under their hours cap, and who is likely to actually show up. That decision gets made dozens of times a week on incomplete information.

Shift Sync attacks both: layered verification for the first, and a natural-language interface plus a ranking model for the second.

---

## Architecture

Three services, split by workload rather than by convention.

```
┌──────────────────────┐
│   React frontend     │  Face descriptor extraction happens here
│   (separate repo)    │  (browser-side, 128-dim vectors)
└──────────┬───────────┘
           │ REST + JWT
┌──────────▼───────────┐        ┌─────────────────────┐
│  Node.js / Express   │───────▶│  Ollama (local)     │
│                      │        │  gemma3             │
│  • Auth & JWT        │        │  Intent extraction  │
│  • MongoDB           │        └─────────────────────┘
│  • Intent Router     │
│  • Face matching     │        ┌─────────────────────┐
│  • GPS velocity      │───────▶│  Python / FastAPI   │
│                      │        │                     │
└──────────────────────┘        │  • Isolation Forest │
                                │    (GPS anomaly)    │
                                │  • Random Forest    │
                                │    (staff ranking)  │
                                └─────────────────────┘
```

**Why split the ML out.** Isolation Forest scoring and staff ranking are CPU-bound and the Python ecosystem for them is far better than the Node one. Keeping them in a separate FastAPI service means a slow model call can't block the Express event loop, and the models can be retrained and redeployed without touching the main application.

**Why a local LLM.** Staff messages contain names, sickness reasons, and schedule data. Running `gemma3` through Ollama on the same server means none of that leaves the deployment for NLP parsing. That's a deliberate privacy decision, not a cost one.

---

## Features

### Fraud-resistant clock-in

Three independent signals, combined rather than trusted individually:

- **Face verification.** The browser extracts a 128-dimensional face descriptor and sends the vector — not the image — to the server. `faceService.js` compares it against the stored descriptor using Euclidean distance. No photographs are transmitted or stored.
- **GPS velocity check.** `staffController.js` calculates implied travel speed between consecutive GPS pings. Anything above 10 mph flags the punch for manager review rather than blocking it, because a false block costs a shift and a false flag costs thirty seconds.
- **Anomaly scoring.** Each clock-in's location data is scored by an Isolation Forest model in the ML service, which catches patterns no threshold rule would — clocking in from a location that's technically valid but unusual for that staff member.

### Natural-language shift management

Staff message the system in plain English. The intent router (`services/intentRouter.js`) sends the message to the local `gemma3` instance, extracts a structured intent, and maps it to a database operation.

```
"I'm sick tomorrow"     →  drop_shift
"can anyone cover Friday" →  request_cover
"what am I working next week" → query_schedule
```

### Smart Match

When a shift is dropped, `smartMatchService.js` filters the staff pool by remaining hours (capped at 40), then asks the ML service to rank the remainder by a suitability score derived from historical reliability and current workload. The manager gets an ordered shortlist instead of a spreadsheet.

### Manager tooling

Excel export of clock-in history, shift swap approval flows, and anomaly review.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| API | Node.js, Express |
| Database | MongoDB |
| ML service | Python, FastAPI, scikit-learn |
| Models | Isolation Forest, Random Forest |
| LLM | Ollama running `gemma3` |
| Auth | JWT (dual-signed) |
| Orchestration | Docker Compose |

---

## Repository structure

```
shift-sync/          Node.js / Express application
  controllers/       Route handlers — staffController.js holds the clock-in flow
  services/          intentRouter.js, faceService.js, smartMatchService.js
  ...
ml-service/          Python / FastAPI service
  models/            staff_ranker.py, GPS anomaly detection
  ...
docker-compose.yml
HANDOVER_AUDIT.md    Technical state, known debt, roadmap
```

---

## Getting started

### Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB (local or Atlas)
- [Ollama](https://ollama.com) with the `gemma3` model pulled

```bash
ollama pull gemma3
```

### Setup

```bash
git clone https://github.com/NikhilBabu829/Shift_Sync.git
cd Shift_Sync
```

**Environment.** Copy the example file and fill it in:

```bash
cp shift-sync/.env.example shift-sync/.env
```

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `ROOT_SECRET` | Outer signing secret for the dual-wrapped staff tokens |
| `OLLAMA_BASE_URL` | Ollama endpoint, e.g. `http://localhost:11434` |
| `ML_SERVICE_URL` | FastAPI service endpoint, e.g. `http://localhost:8000` |
| `PORT` | Express port |

**Install and run:**

```bash
# Node API
cd shift-sync
npm install
npm run dev

# ML service (separate terminal)
cd ml-service
pip install -r requirements.txt
uvicorn main:app --reload
```

Or bring everything up together:

```bash
docker-compose up
```

---

## Design decisions worth explaining

**Flag, don't block.** Every fraud signal produces a flag for manager review rather than an automatic rejection. An incorrectly blocked clock-in means someone doesn't get paid for a shift they worked, which is a much worse failure than a manager spending thirty seconds dismissing a false positive.

**Fail open.** The ML service is called asynchronously during clock-in. If it's unavailable, the punch is recorded without an anomaly score rather than failing. Availability of the core function beats completeness of the fraud data.

**Descriptors, not images.** Face matching operates on 128-dimensional vectors extracted client-side. The server never receives or stores a photograph, which substantially reduces the data protection surface.

**Dual-wrapped JWTs.** Staff tokens are signed with both a root secret and a JWT secret. This adds middleware complexity, documented in `tokenSign.js`, in exchange for compromise of a single secret not being sufficient to forge a staff token.

---

## Known limitations

Honest list, because this is a prototype:

- **Models are static.** There's no retraining loop. The staff ranker is trained once and doesn't learn from new clock-in data.
- **No indexing strategy at scale.** The `clockins` collection needs a compound index on `staffMember` + `dateClockedIn` before the Smart Match history lookups stay fast on a large dataset.
- **No rate limiting on `/api/chat`.** LLM resource exhaustion is currently possible.
- **LLM output isn't fully guarded.** If `gemma3` returns malformed JSON, the intent router doesn't yet degrade gracefully to a clarification prompt.
- **No test coverage.** `faceService` and `gpsService` hold the fraud logic and both need unit tests before any change is safe.
- **Notifications are polling and email only.** No WebSocket layer.

---

## Roadmap

**Robustness** — error boundary around the intent router, model retraining script, rate limiting on the chat endpoint.

**Features** — manager approval dashboard for swaps, Socket.io real-time notifications, filterable Excel export.

**Production** — full containerisation of Node, MongoDB, Ollama and the ML service; Vitest/Jest coverage on the fraud logic.

---

## Author

**Nikhil Babu Guntipally**
MSc Computing, Griffith College Dublin

[GitHub](https://github.com/NikhilBabu829) · [LinkedIn](https://www.linkedin.com/in/nikhil-babu-guntipally-b46b27217/)
