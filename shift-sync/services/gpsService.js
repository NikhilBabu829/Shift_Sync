/**
 * GPS Service — pure math, no I/O, no external dependencies.
 * Used by staffClockIn to detect drive-by punches and GPS spoofing.
 */

const DRIVE_BY_THRESHOLD_MPH = parseFloat(process.env.DRIVE_BY_THRESHOLD_MPH) || 10
const EARTH_RADIUS_METERS = 6371000

/**
 * Calculates the distance in meters between two GPS coordinates
 * using the Haversine formula.
 */
function haversineDistanceMeters(coord1, coord2) {
    const toRad = (deg) => (deg * Math.PI) / 180

    const dLat = toRad(coord2.lat - coord1.lat)
    const dLng = toRad(coord2.lng - coord1.lng)

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(coord1.lat)) *
            Math.cos(toRad(coord2.lat)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return EARTH_RADIUS_METERS * c
}

/**
 * Returns speed in mph given two coordinates and a time delta in milliseconds.
 */
function calculateVelocityMph(coord1, coord2, deltaMs) {
    if (deltaMs <= 0) return 0
    const distanceMeters = haversineDistanceMeters(coord1, coord2)
    const distanceMiles = distanceMeters / 1609.344
    const hours = deltaMs / 3600000
    return distanceMiles / hours
}

/**
 * Accepts the GPS coordinate array from the clock-in request.
 * Returns { isDriveByPunch, maxVelocityMph }
 *
 * A drive-by punch is flagged if any consecutive pair of coordinates
 * shows a speed above DRIVE_BY_THRESHOLD_MPH.
 */
function runVelocityChecks(gpsCoordinates) {
    if (!gpsCoordinates || gpsCoordinates.length < 2) {
        return { isDriveByPunch: false, maxVelocityMph: null }
    }

    let maxVelocityMph = 0

    for (let i = 1; i < gpsCoordinates.length; i++) {
        const prev = gpsCoordinates[i - 1]
        const curr = gpsCoordinates[i]
        const deltaMs = curr.timestamp - prev.timestamp

        // If the distance between the two readings is within the combined accuracy
        // radius of both sensors, the apparent movement is just measurement noise
        // (common with WiFi-based geolocation). Skip this pair rather than
        // computing a falsely high velocity.
        const distanceMeters = haversineDistanceMeters(prev, curr)
        const combinedAccuracy = (prev.accuracy || 0) + (curr.accuracy || 0)
        if (combinedAccuracy > 0 && distanceMeters <= combinedAccuracy) continue

        const mph = calculateVelocityMph(prev, curr, deltaMs)
        if (mph > maxVelocityMph) maxVelocityMph = mph
    }

    return {
        isDriveByPunch: maxVelocityMph > DRIVE_BY_THRESHOLD_MPH,
        maxVelocityMph: parseFloat(maxVelocityMph.toFixed(2))
    }
}

/**
 * Returns true if all coordinates in the array are bit-for-bit identical.
 * Real GPS hardware always has slight variance — zero variance means fake GPS.
 */
function detectZeroVariance(gpsCoordinates) {
    if (!gpsCoordinates || gpsCoordinates.length < 2) return false

    const first = gpsCoordinates[0]
    return gpsCoordinates.every(
        (coord) => coord.lat === first.lat && coord.lng === first.lng
    )
}

module.exports = { haversineDistanceMeters, calculateVelocityMph, runVelocityChecks, detectZeroVariance }
