const AVAILABILITY = require('../models/staffAvailability')

/**
 * Checks whether a staff member is available to work a given shift.
 *
 * Resolution order:
 *   1. Specific date override (type = 'date') — takes precedence over weekly pattern.
 *   2. Weekly recurring entry (type = 'weekly') — used when no date override exists.
 *   3. No entry at all — treated as fully available (no restriction declared).
 *
 * For time-restricted entries the entire shift must fit within the available window.
 *
 * @param {string|ObjectId} staffId
 * @param {string} shiftDate       YYYY-MM-DD
 * @param {string} shiftStartTime  HH:MM
 * @param {string} shiftEndTime    HH:MM
 * @returns {{ available: boolean, reason?: string }}
 */
async function isAvailableForShift(staffId, shiftDate, shiftStartTime, shiftEndTime) {
    // 1. Check for a specific date override
    const dateOverride = await AVAILABILITY.findOne({
        staffMember: staffId,
        type: 'date',
        date: shiftDate
    }).lean()

    if (dateOverride) {
        if (!dateOverride.available) {
            return { available: false, reason: `Marked unavailable on ${shiftDate}` }
        }
        if (dateOverride.startTime && dateOverride.endTime) {
            if (!shiftFitsWindow(shiftStartTime, shiftEndTime, dateOverride.startTime, dateOverride.endTime)) {
                return {
                    available: false,
                    reason: `Only available ${dateOverride.startTime}–${dateOverride.endTime} on ${shiftDate} (shift requires ${shiftStartTime}–${shiftEndTime})`
                }
            }
        }
        return { available: true }
    }

    // 2. Fall back to weekly pattern
    // Parse dayOfWeek from the date string in UTC noon to avoid timezone boundary issues
    const dayOfWeek = new Date(`${shiftDate}T12:00:00Z`).getDay()

    const weeklyEntry = await AVAILABILITY.findOne({
        staffMember: staffId,
        type: 'weekly',
        dayOfWeek
    }).lean()

    if (!weeklyEntry) {
        return { available: true } // no restriction declared
    }

    if (!weeklyEntry.available) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        return { available: false, reason: `Not available on ${dayNames[dayOfWeek]}s` }
    }

    if (weeklyEntry.startTime && weeklyEntry.endTime) {
        if (!shiftFitsWindow(shiftStartTime, shiftEndTime, weeklyEntry.startTime, weeklyEntry.endTime)) {
            return {
                available: false,
                reason: `Only available ${weeklyEntry.startTime}–${weeklyEntry.endTime} on this day (shift requires ${shiftStartTime}–${shiftEndTime})`
            }
        }
    }

    return { available: true }
}

/**
 * Returns true if the shift (start–end) fits entirely within the available window.
 * Compares HH:MM strings lexicographically, which is valid for 00:00–23:59 ranges.
 */
function shiftFitsWindow(shiftStart, shiftEnd, windowStart, windowEnd) {
    return shiftStart >= windowStart && shiftEnd <= windowEnd
}

/**
 * Returns the declared availability window for a staff member on a specific date.
 * Used by the roster generator to schedule shifts within the staff member's stated hours.
 *
 * @returns {{ available: boolean, startTime: string|null, endTime: string|null, reason?: string }}
 *   available  — false if the staff member cannot work that day at all
 *   startTime  — declared window start, or null if available all day
 *   endTime    — declared window end, or null if available all day
 */
async function getAvailabilityWindow(staffId, date) {
    const dateOverride = await AVAILABILITY.findOne({
        staffMember: staffId,
        type: 'date',
        date
    }).lean()

    if (dateOverride) {
        if (!dateOverride.available) return { available: false, startTime: null, endTime: null }
        return { available: true, startTime: dateOverride.startTime || null, endTime: dateOverride.endTime || null }
    }

    const dayOfWeek = new Date(`${date}T12:00:00Z`).getDay()
    const weeklyEntry = await AVAILABILITY.findOne({
        staffMember: staffId,
        type: 'weekly',
        dayOfWeek
    }).lean()

    if (!weeklyEntry) return { available: true, startTime: null, endTime: null }
    if (!weeklyEntry.available) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        return { available: false, startTime: null, endTime: null, reason: `Not available on ${dayNames[dayOfWeek]}s` }
    }
    return { available: true, startTime: weeklyEntry.startTime || null, endTime: weeklyEntry.endTime || null }
}

module.exports = { isAvailableForShift, getAvailabilityWindow }
