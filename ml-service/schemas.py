from pydantic import BaseModel
from typing import Optional


# --- GPS Anomaly ---

class GPSCoordinate(BaseModel):
    lat: float
    lng: float
    timestamp: Optional[int] = None


class GPSAnomalyRequest(BaseModel):
    staffId: str
    gpsCoordinates: list[GPSCoordinate]
    clockInId: Optional[str] = None
    historicalCoordinates: Optional[list[GPSCoordinate]] = []


class GPSAnomalyResponse(BaseModel):
    isolation_score: Optional[float]
    is_anomaly: bool
    confidence: str


# --- Staff Ranker ---

class HistoricalAcceptance(BaseModel):
    dayOfWeek: int
    hour: float
    accepted: bool


class StaffCandidate(BaseModel):
    staffId: str
    email: Optional[str] = None
    staffName: Optional[str] = None
    historicalAcceptances: list[HistoricalAcceptance] = []
    recentShiftCount: int = 0
    avgHoursPerWeek: float = 0.0


class ShiftContext(BaseModel):
    shiftDate: Optional[str] = None
    shiftStartTime: Optional[str] = "09:00"
    shiftEndTime: Optional[str] = "17:00"
    requiredRole: Optional[str] = "staff"


class RankStaffRequest(BaseModel):
    shiftData: ShiftContext
    candidates: list[StaffCandidate]


class RankedCandidate(BaseModel):
    staffId: str
    score: float
    rank: int


class RankStaffResponse(BaseModel):
    rankedCandidates: list[RankedCandidate]


# --- Retrain ---

class RetrainRequest(BaseModel):
    trainingData: list[StaffCandidate]


class RetrainResponse(BaseModel):
    status: str
    staffCount: int
    sampleCount: int
