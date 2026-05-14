/**
 * Face Service — pure math, no I/O, no external dependencies.
 * Used by staffClockIn to verify a face descriptor against the stored one.
 * All descriptor extraction runs in the browser (face-api.js / TensorFlow.js).
 */

const FACE_MATCH_THRESHOLD = 0.4   // standard face-api.js threshold for a positive match

/**
 * Calculates the Euclidean distance between two 128-dimensional face descriptors.
 * Lower = more similar. Returns Infinity if arrays differ in length.
 */
function euclideanDistance(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity
    return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0))
}

/**
 * Compares an incoming face descriptor against the stored one.
 * Returns { isVerified, distance }
 * isVerified = true if distance is below threshold (same person).
 */
function verifyFace(storedDescriptor, incomingDescriptor) {
    const distance = euclideanDistance(storedDescriptor, incomingDescriptor)
    return {
        isVerified : distance < FACE_MATCH_THRESHOLD,
        distance   : parseFloat(distance.toFixed(4))
    }
}

/**
 * Returns true if the descriptor array looks like a valid face-api.js output.
 * face-api.js always produces exactly 128 floats.
 */
function isValidDescriptor(descriptor) {
    return Array.isArray(descriptor) &&
        descriptor.length === 128 &&
        descriptor.every((v) => typeof v === 'number' && isFinite(v))
}

module.exports = { verifyFace, isValidDescriptor }
