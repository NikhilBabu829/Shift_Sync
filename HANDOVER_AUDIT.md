# 📋 PROJECT HANDOVER AUDIT: Shift-Sync (Backend)
**Prepared for:** Jules
**Status:** Alpha / Prototype (Core Logic Implementation Complete)
**Date:** May 14, 2026

---

## 1. Executive Summary
Shift-Sync has evolved from a basic clock-in system into an AI-augmented shift management platform. The backend now supports:
- **Fraud-Proof Clock-Ins:** Face verification (Euclidean distance) + GPS Velocity/Anomaly detection.
- **NLP Shift Management:** A local LLM (Ollama) parses staff messages into database actions.
- **Smart Matching:** An ML-driven ranking system that suggests the best staff to cover open shifts based on historical reliability and workload.

---

## 2. Current Technical State ("Dead On")

### A. The Microservice Split
- **Main App (Node.js/Express):** Handles Auth, DB (MongoDB), and the "Intent Router."
- **ML Service (Python/FastAPI):** Offloads heavy lifting for GPS Isolation Forest (anomaly detection) and Staff Ranking (Random Forest).
- **AI Layer (Local Ollama):** Uses `gemma3` to extract intents. **Privacy Win:** No data leaves the server for NLP parsing.

### B. Core Features & Recent Wins
1.  **Intent Router:** The "glue" that turns "I'm sick tomorrow" into a `drop_shift` operation in the DB.
2.  **GPS "Drive-By" Prevention:** Logic in `staffController.js` calculates velocity between GPS pings. If > 10mph, it flags the punch but doesn't block it (allows manager review).
3.  **Face Verification:** 128-dimensional descriptor matching. Descriptor extraction is handled by the frontend; the backend performs the math in `faceService.js`.
4.  **Smart Match:** When a shift is dropped, `smartMatchService.js` filters staff by hours (cap at 40) and then asks the ML service to rank them by "suitability score."

---

## 3. Technical Debt & Known Constraints
- **Concurrency:** The ML service is called asynchronously during clock-in to avoid blocking the user. If the ML service is down, it "fails open" (records the punch without the isolation score).
- **Database Indexing:** As the `clockins` collection grows, we need better indexing on `staffMember` + `dateClockedIn` for the Smart Match history lookups.
- **Token Dual-Wrapping:** Staff JWTs use a "double-wrap" (Root Secret + JWT Secret). This is secure but adds complexity to the middleware. Ensure `tokenSign.js` is understood before modification.

---

## 4. Roadmap: The Path to "Finished Product"

### Phase 1: Robustness (Short Term)
- [ ] **Global Error Boundary:** Wrap `intentRouter.js` in a more robust try/catch with fallback "Clarification" messages if the LLM hallucinating JSON.
- [ ] **ML Retraining Loop:** Currently, the ML models are static. We need a script to periodically retrain the `staff_ranker.py` using the latest `clockins` data.
- [ ] **Rate Limiting:** Implement `express-rate-limit` on the `/api/chat` endpoint to prevent LLM resource exhaustion.

### Phase 2: Feature Completion (Mid Term)
- [ ] **Manager Approval UI for Swaps:** The backend logic for swaps exists, but the "Approval/Rejection" flow needs a dedicated dashboard view for managers.
- [ ] **WebSocket Notifications:** Replace current polling/email-only alerts with real-time Socket.io notifications for "Shift Covered" or "GPS Warning."
- [ ] **Excel Customization:** Allow managers to filter the Excel export by date range or specific department (currently exports full history).

### Phase 3: Production Readiness (Long Term)
- [ ] **Dockerization:** Containerize the Node.js app, MongoDB, Ollama, and the Python ML service using `docker-compose`.
- [ ] **CI/CD:** Add Vitest/Jest unit tests for `faceService` and `gpsService` to prevent regressions in the fraud logic.

---

## 5. Critical File Map
- `shift-sync/services/intentRouter.js`: The most important file for AI behavior.
- `shift-sync/controllers/staffController.js`: Contains the complex `clockIn` flow (lines 200-280).
- `ml-service/models/staff_ranker.py`: The "brain" behind Smart Match suitability scores.
- `shift-sync/.env`: Ensure `OLLAMA_BASE_URL` and `ML_SERVICE_URL` are set correctly.

---
**Handover complete. Good luck, Jules.**
