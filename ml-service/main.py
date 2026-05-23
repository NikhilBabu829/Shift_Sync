import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    GPSAnomalyRequest,
    GPSAnomalyResponse,
    RankStaffRequest,
    RankStaffResponse,
    RetrainRequest,
    RetrainResponse,
)
from models.gps_anomaly import GPSAnomalyDetector
from models.staff_ranker import StaffRanker

# Persisted ranker loaded from disk at startup; replaced after each retrain
_global_ranker: StaffRanker | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _global_ranker
    ranker = StaffRanker()
    if ranker.load():
        _global_ranker = ranker
        print("[ml-service] Loaded persisted staff ranker model.")
    else:
        print("[ml-service] No persisted model found — will use inline training until first retrain.")
    yield


app = FastAPI(title="Shift-Sync ML Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("ALLOWED_ORIGIN", "http://localhost:3000")],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ml/gps-anomaly", response_model=GPSAnomalyResponse)
def gps_anomaly(body: GPSAnomalyRequest):
    """
    Detects GPS spoofing using Isolation Forest trained on historical coordinates.
    Falls back to zero-variance heuristic if not enough history.
    """
    detector = GPSAnomalyDetector(contamination=0.1)

    historical = [{"lat": c.lat, "lng": c.lng} for c in (body.historicalCoordinates or [])]
    detector.fit(historical)

    new_coords = [{"lat": c.lat, "lng": c.lng} for c in body.gpsCoordinates]
    result = detector.predict(new_coords)

    return GPSAnomalyResponse(
        isolation_score=result["isolation_score"],
        is_anomaly=result["is_anomaly"],
        confidence=result["confidence"],
    )


@app.post("/ml/rank-staff", response_model=RankStaffResponse)
def rank_staff(body: RankStaffRequest):
    """
    Ranks eligible staff by their likelihood to accept an open shift.
    Uses the persisted weekly-trained model when available; falls back to
    inline training on cold start.
    """
    ranker = _global_ranker if _global_ranker is not None else StaffRanker()

    candidates_dicts = [
        {
            "staffId": c.staffId,
            "email": c.email,
            "staffName": c.staffName,
            "historicalAcceptances": [
                {"dayOfWeek": h.dayOfWeek, "hour": h.hour, "accepted": h.accepted}
                for h in c.historicalAcceptances
            ],
            "recentShiftCount": c.recentShiftCount,
            "avgHoursPerWeek": c.avgHoursPerWeek,
        }
        for c in body.candidates
    ]

    shift_dict = {
        "shiftDate": body.shiftData.shiftDate,
        "shiftStartTime": body.shiftData.shiftStartTime,
        "shiftEndTime": body.shiftData.shiftEndTime,
        "requiredRole": body.shiftData.requiredRole,
    }

    ranked = ranker.rank(shift_dict, candidates_dicts)

    return RankStaffResponse(rankedCandidates=ranked)


@app.post("/ml/retrain", response_model=RetrainResponse)
def retrain_model(body: RetrainRequest):
    """
    Retrains the staff ranker on the provided historical data and persists the
    model to disk. Called by the Node.js weekly cron every Sunday at midnight.
    """
    global _global_ranker

    candidates = [
        {
            "staffId": c.staffId,
            "historicalAcceptances": [
                {"dayOfWeek": h.dayOfWeek, "hour": h.hour, "accepted": h.accepted}
                for h in c.historicalAcceptances
            ],
            "recentShiftCount": c.recentShiftCount,
            "avgHoursPerWeek": c.avgHoursPerWeek,
        }
        for c in body.trainingData
    ]

    sample_count = sum(len(c["historicalAcceptances"]) for c in candidates)

    ranker = StaffRanker()
    result = ranker.fit_and_save(candidates)

    if result["status"] == "trained":
        _global_ranker = ranker

    return RetrainResponse(
        status=result["status"],
        staffCount=len(candidates),
        sampleCount=sample_count,
    )
