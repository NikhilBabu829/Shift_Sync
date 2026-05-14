/**
 * ML Service — HTTP client for the Python FastAPI microservice.
 * All calls are fail-open: if the Python service is down, we return null
 * and the caller handles it gracefully (clock-in still succeeds, etc.)
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
const ML_TIMEOUT_MS = parseInt(process.env.ML_SERVICE_TIMEOUT_MS) || 3000

async function post(endpoint, body) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS)
    try {
        const res = await fetch(`${ML_SERVICE_URL}${endpoint}`, {
            method : 'POST',
            headers : { 'Content-Type' : 'application/json' },
            body : JSON.stringify(body),
            signal : controller.signal
        })
        if (!res.ok) return null
        return await res.json()
    } catch {
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
