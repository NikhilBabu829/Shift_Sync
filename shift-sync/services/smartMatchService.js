/**
 * Smart Match Service
 *
 * Finds the best staff candidates to cover an open shift.
 * Step 1 — Hard filters in MongoDB (rules-based, no ML)
 * Step 2 — Soft scoring via the Python ML microservice
 * Step 3 — Notify the top 3 candidates by email
 */

// Mongoose models used for eligibility filtering
const STAFF = require('../models/staff')
const CLOCKIN = require('../models/clockIn')
// ML client for soft-score ranking of eligible candidates
const { rankStaffForCoverage } = require('./mlService')

// Weekly hours cap used to filter out staff who are already at their limit
const MAX_WEEKLY_HOURS = 40
// Maximum number of candidates to notify and return
const TOP_N = 3

/**
 * Parses a "HH:MM" time string into fractional hours (e.g. "09:30" → 9.5).
 */
function timeStringToHours(timeStr) {
    if (!timeStr) return 0
    const [h, m] = timeStr.split(':').map(Number)
    return h + (m || 0) / 60
}

/**
 * Returns total hours clocked in during a given date range for a staff member.
 * Uses startOfShift / endOfShift stored on ClockIn records.
 */
async function calculateWeeklyHours(staffId, weekStart, weekEnd) {
    const records = await CLOCKIN.find({
        staffMember : staffId,
        dateClockedIn : { $gte : weekStart, $lte : weekEnd }
    }).lean()

    // Sum shift durations from the stored start/end times on each clock-in record
    return records.reduce((total, record) => {
        const start = timeStringToHours(record.startOfShift)
        const end = timeStringToHours(record.endOfShift)
        return total + Math.max(0, end - start)
    }, 0)
}

/**
 * Returns ISO date strings for the start and end of the week containing `date`.
 */
function getWeekBounds(dateStr) {
    const d = new Date(dateStr || Date.now())
    const day = d.getDay()
    // Compute the Monday of the same week
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((day + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return {
        weekStart : monday.toISOString().split('T')[0],
        weekEnd : sunday.toISOString().split('T')[0]
    }
}

/**
 * Main entry point.
 * Takes an open shift document and returns the top-ranked candidates.
 * Also fires off email notifications to those candidates.
 */
async function findCoverCandidates(openShift) {
    const shiftDate = openShift.date || openShift.shiftDate
    const { weekStart, weekEnd } = getWeekBounds(shiftDate)
    // Calculate how many hours this shift adds to a candidate's weekly total
    const shiftHours = timeStringToHours(openShift.shift_end_time) - timeStringToHours(openShift.shift_start_time)
    const requiredRole = openShift.requiredRole || 'staff'

    // --- Step 1: Hard Filters ---

    // a. Get all staff with the required role, excluding the person who dropped the shift
    const shiftOwner = openShift.belongs_to
    const allStaff = await STAFF.find({ role : requiredRole, _id : { $ne : shiftOwner } }).lean()

    // b. Find staff already clocked in on the shift date (already working that day)
    const alreadyWorkingIds = await CLOCKIN.distinct('staffMember', {
        dateClockedIn : shiftDate ? String(shiftDate) : { $exists : true }
    })
    // Use a Set for O(1) membership checks during the eligibility loop
    const alreadyWorkingSet = new Set(alreadyWorkingIds.map(String))

    // c. Filter out staff already working or who would exceed weekly hours
    const eligible = []
    for (const staff of allStaff) {
        const staffIdStr = String(staff._id)

        // Skip if already working that day
        if (alreadyWorkingSet.has(staffIdStr)) continue

        // Skip if taking this shift would push them over 40 hours
        const weeklyHours = await calculateWeeklyHours(staffIdStr, weekStart, weekEnd)
        if (weeklyHours + shiftHours > MAX_WEEKLY_HOURS) continue

        // Build the feature payload for the ML ranker using recent clock-in history
        const history = await CLOCKIN.find({ staffMember : staff._id })
            .sort({ dateClockedIn : -1 })
            .limit(50)
            .lean()

        // Each clock-in record represents an accepted shift — encode day/hour patterns for ML
        const acceptanceHistory = history.map((record) => {
            const d = new Date(record.dateClockedIn)
            return {
                dayOfWeek : d.getDay(),
                hour : timeStringToHours(record.startOfShift),
                accepted : true  // presence of a clock-in record means they accepted
            }
        })

        eligible.push({
            staffId : staffIdStr,
            email : staff.email,
            staffName : staff.staffName,
            historicalAcceptances : acceptanceHistory,
            recentShiftCount : history.length,
            avgHoursPerWeek : weeklyHours
        })
    }

    if (eligible.length === 0) {
        console.log('Smart Match: no eligible staff found for shift', openShift._id)
        return []
    }

    // --- Step 2: ML Soft Scoring ---
    // Default all candidates to a neutral score in case the ML service is unavailable
    let rankedCandidates = eligible.map((s, i) => ({ ...s, score : 0.5, rank : i + 1 }))

    const mlResult = await rankStaffForCoverage(
        {
            shiftDate : shiftDate,
            shiftStartTime : openShift.shift_start_time,
            shiftEndTime : openShift.shift_end_time,
            requiredRole
        },
        eligible
    )

    if (mlResult && Array.isArray(mlResult.rankedCandidates)) {
        // Merge ML scores back into the eligible list
        const scoreMap = {}
        for (const r of mlResult.rankedCandidates) {
            scoreMap[r.staffId] = r.score
        }
        // Re-rank by ML score descending; missing scores fall back to 0.5
        rankedCandidates = eligible
            .map((s) => ({ ...s, score : scoreMap[s.staffId] ?? 0.5 }))
            .sort((a, b) => b.score - a.score)
            .map((s, i) => ({ ...s, rank : i + 1 }))
    }

    // Slice the top N for notification
    const top = rankedCandidates.slice(0, TOP_N)

    // --- Step 3: Notify top candidates ---
    // Build the notification payload expected by notifyCoverCandidates
    const notifyPayload = top.map((c) => ({
        email : c.email,
        staffName : c.staffName,
        shiftDate : String(shiftDate),
        startTime : openShift.shift_start_time,
        endTime : openShift.shift_end_time,
        score : c.score
    }))

    // Emit a socket event so the manager dashboard shows the open shift in real time
    try {
        const io = require('../utils/socket').getIO();
        io.emit('shift_open', { shift: openShift, candidates: top });
    } catch (socketErr) {
        console.error('Socket error on shift_open emit:', socketErr);
    }

    // Return only the fields needed by callers (controllers, intent router)
    return top.map((c) => ({
        staffId : c.staffId,
        staffName : c.staffName,
        score : c.score,
        rank : c.rank
    }))
}

module.exports = { findCoverCandidates, calculateWeeklyHours }
