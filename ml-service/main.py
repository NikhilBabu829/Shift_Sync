import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    GPSAnomalyRequest,
    GPSAnomalyResponse,
    RankStaffRequest,
    RankStaffResponse,
)
from models.gps_anomaly import GPSAnomalyDetector
from models.staff_ranker import StaffRanker

app = FastAPI(title="Shift-Sync ML Service", version="1.0.0")

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
    Ranks eligible staff by their likelihood to accept an open shift
    using a Random Forest trained on historical clock-in patterns.
    Falls back to a heuristic sort on cold start.
    """
    ranker = StaffRanker()

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
