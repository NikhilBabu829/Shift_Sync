/**
 * ML Service — HTTP client for the Python FastAPI microservice.
 * All calls are fail-open: if the Python service is down, we return null
 * and the caller handles it gracefully (clock-in still succeeds, etc.)
 */

// Base URL of the Python ML microservice; defaults to localhost for local development
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
// Maximum time to wait for the ML service before giving up and returning null
const ML_TIMEOUT_MS = parseInt(process.env.ML_SERVICE_TIMEOUT_MS) || 3000

// Internal helper: POSTs JSON to the given endpoint with a configurable timeout
async function post(endpoint, body) {
    // AbortController lets us cancel the fetch after the timeout expires
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS)
    try {
        const res = await fetch(`${ML_SERVICE_URL}${endpoint}`, {
            method : 'POST',
            headers : { 'Content-Type' : 'application/json' },
            body : JSON.stringify(body),
            signal : controller.signal
        })
        // Treat non-2xx responses as unavailable rather than throwing
        if (!res.ok) return null
        return await res.json()
    } catch {
        // Network errors and AbortError (timeout) both return null — fail open
        return null
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Sends GPS coordinates to the Python service for Isolation Forest anomaly scoring.
 * Returns { isolationScore, isAnomaly, confidence } or null if unavailable.
 */
async function checkGPSAnomaly({ staffId, gpsCoordinates, clockInId }) {
    return post('/ml/gps-anomaly', { staffId, gpsCoordinates, clockInId })
}

/**
 * Sends eligible staff candidates to Python for ranking by acceptance likelihood.
 * Returns { rankedCandidates: [{ staffId, score, rank }] } or null if unavailable.
 */
async function rankStaffForCoverage(shiftData, candidates) {
    return post('/ml/rank-staff', { shiftData, candidates })
}

module.exports = { checkGPSAnomaly, rankStaffForCoverage }
