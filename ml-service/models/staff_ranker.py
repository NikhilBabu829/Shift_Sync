import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler


class StaffRanker:
    """
    Ranks staff candidates by their likelihood to accept a given shift.

    Features used per candidate:
    - day_of_week (0=Mon, 6=Sun) of the open shift
    - hour of shift start
    - historical_accept_rate: proportion of past shifts they accepted on same day-of-week
    - recent_shift_count: how many shifts they've worked recently (proxy for availability enthusiasm)
    - avg_hours_per_week: their typical workload

    On cold start (fewer than MIN_HISTORY records), falls back to a
    heuristic sort: fewest recent hours first (most likely to want more work).
    """

    MIN_HISTORY = 10
    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    def _build_features(self, candidate: dict, shift_day: int, shift_hour: float) -> np.ndarray:
        history = candidate.get("historicalAcceptances", [])

        # Accept rate on same day of week
        same_day = [h for h in history if h.get("dayOfWeek") == shift_day]
        accept_rate = sum(1 for h in same_day if h.get("accepted")) / max(len(same_day), 1)

        # How recently have they been working (0-50 scale)
        recent = min(candidate.get("recentShiftCount", 0), 50) / 50.0

        # Average weekly hours normalised to 0-1 (over 40 = 1.0)
        avg_hours = min(candidate.get("avgHoursPerWeek", 0), 40) / 40.0

        return np.array([shift_day / 6.0, shift_hour / 23.0, accept_rate, recent, avg_hours])

    def rank(self, shift_context: dict, candidates: list[dict]) -> list[dict]:
        if not candidates:
            return []

        try:
            shift_date_str = shift_context.get("shiftDate", "")
            from datetime import datetime
            shift_day = datetime.strptime(shift_date_str, "%Y-%m-%d").weekday() if shift_date_str else 0
        except ValueError:
            shift_day = 0

        start_time = shift_context.get("shiftStartTime", "09:00")
        try:
            h, m = start_time.split(":")
            shift_hour = int(h) + int(m) / 60
        except (ValueError, AttributeError):
            shift_hour = 9.0

        # Build feature matrix
        X = np.array([
            self._build_features(c, shift_day, shift_hour) for c in candidates
        ])

        total_history = sum(len(c.get("historicalAcceptances", [])) for c in candidates)

        if total_history < self.MIN_HISTORY:
            # Cold start: sort by lowest avg_hours (most room to take on work)
            sorted_candidates = sorted(
                candidates,
                key=lambda c: c.get("avgHoursPerWeek", 0)
            )
            scores = np.linspace(0.9, 0.5, len(sorted_candidates))
        else:
            # Build training data from historical acceptances
            X_train, y_train = [], []
            for c in candidates:
                for h_record in c.get("historicalAcceptances", []):
                    feat = self._build_features(c, h_record.get("dayOfWeek", 0), h_record.get("hour", 9.0))
                    X_train.append(feat)
                    y_train.append(int(h_record.get("accepted", True)))

            if len(set(y_train)) < 2:
                # All same label — can't train, use heuristic
                sorted_candidates = sorted(candidates, key=lambda c: c.get("avgHoursPerWeek", 0))
                scores = np.linspace(0.9, 0.5, len(sorted_candidates))
            else:
                scaler = StandardScaler()
                X_train_scaled = scaler.fit_transform(np.array(X_train))
                X_scaled = scaler.transform(X)

                clf = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=4)
                clf.fit(X_train_scaled, y_train)

                proba = clf.predict_proba(X_scaled)
                # Index of class=1 (will accept)
                pos_idx = list(clf.classes_).index(1) if 1 in clf.classes_ else 0
                scores = proba[:, pos_idx]

                order = np.argsort(scores)[::-1]
                sorted_candidates = [candidates[i] for i in order]
                scores = scores[order]

        return [
            {
                "staffId": c["staffId"],
                "score": round(float(scores[i]), 4),
                "rank": i + 1,
            }
            for i, c in enumerate(sorted_candidates)
        ]
