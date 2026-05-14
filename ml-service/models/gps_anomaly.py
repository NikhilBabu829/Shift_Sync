import numpy as np
from sklearn.ensemble import IsolationForest


class GPSAnomalyDetector:
    """
    Uses Isolation Forest to detect GPS spoofing.

    Real GPS coordinates have inherent noise (small random variance).
    A perfect sequence of identical coordinates is a strong signal of
    a fake-GPS app. The Isolation Forest will score these as highly anomalous.

    The model is fitted on-the-fly from historical clock-in coordinates
    passed in the request — no model persistence needed for v1.
    """

    def __init__(self, contamination: float = 0.1):
        self.contamination = contamination
        self.model = None

    def _coords_to_array(self, coords: list[dict]) -> np.ndarray:
        return np.array([[c["lat"], c["lng"]] for c in coords])

    def fit(self, historical_coords: list[dict]) -> None:
        if len(historical_coords) < 5:
            self.model = None
            return
        X = self._coords_to_array(historical_coords)
        self.model = IsolationForest(
            contamination=self.contamination,
            random_state=42,
            n_estimators=100,
        )
        self.model.fit(X)

    def predict(self, new_coords: list[dict]) -> dict:
        if not new_coords:
            return {"isolation_score": None, "is_anomaly": False, "confidence": "insufficient_data"}

        if self.model is None:
            # Not enough history to train — fall back to variance check
            lats = [c["lat"] for c in new_coords]
            lngs = [c["lng"] for c in new_coords]
            lat_var = np.var(lats)
            lng_var = np.var(lngs)
            zero_var = (lat_var == 0.0 and lng_var == 0.0 and len(new_coords) > 1)
            return {
                "isolation_score": 1.0 if zero_var else 0.1,
                "is_anomaly": zero_var,
                "confidence": "heuristic",
            }

        X_new = self._coords_to_array(new_coords)

        # score_samples returns negative values: more negative = more anomalous
        raw_scores = self.model.score_samples(X_new)
        # Normalise to [0, 1] where 1 = most anomalous
        min_s, max_s = raw_scores.min(), raw_scores.max()
        if max_s == min_s:
            normalised = 0.5
        else:
            normalised = float(1 - (raw_scores.mean() - min_s) / (max_s - min_s))

        predictions = self.model.predict(X_new)  # -1 = anomaly, 1 = normal
        is_anomaly = bool((predictions == -1).any())

        confidence = "high" if len(new_coords) >= 3 else "low"

        return {
            "isolation_score": round(normalised, 4),
            "is_anomaly": is_anomaly,
            "confidence": confidence,
        }
