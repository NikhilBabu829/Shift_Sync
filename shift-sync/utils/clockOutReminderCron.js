const cron = require('node-cron')
const ClockIn  = require('../models/clockIn')
const ClockOut = require('../models/clockOut')
const Staff    = require('../models/staff')
const { sendPush } = require('./webPush')

// Parse "H:MM" or "HH:MM" → { h, m }.  Returns null on bad input.
function parseShiftTime(str) {
    if (!str) return null
    const parts = str.split(':')
    if (parts.length !== 2) return null
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (isNaN(h) || isNaN(m)) return null
    return { h, m }
}

// Returns true when endOfShift is between 4 and 6 minutes from `now`.
// Handles midnight-crossing shifts (e.g. "00:30").
function isDueInFiveMinutes(endOfShift, now) {
    const parsed = parseShiftTime(endOfShift)
    if (!parsed) return false
    const end = new Date(now)
    end.setHours(parsed.h, parsed.m, 0, 0)
    // If end looks like it was yesterday, push it to tomorrow
    if (end < now && now - end > 12 * 60 * 60 * 1000) end.setDate(end.getDate() + 1)
    const diffMin = (end - now) / 60_000
    return diffMin >= 4 && diffMin < 6
}

// Starts a cron that fires every minute and pushes a clock-out reminder
// to any staff member whose shift ends in ~5 minutes and who hasn't yet clocked out.
function startClockOutReminderCron() {
    cron.schedule('* * * * *', async () => {
        try {
            const now      = new Date()
            const todayStr = now.toDateString()

            const todayClockIns = await ClockIn.find({ dateClockedIn: todayStr }).lean()
            if (todayClockIns.length === 0) return

            const due = todayClockIns.filter(ci => isDueInFiveMinutes(ci.endOfShift, now))
            if (due.length === 0) return

            for (const ci of due) {
                // Skip if they've already clocked out
                const stillOpen = await ClockOut.findOne({
                    staffMember: ci.staffMember,
                    timeClockedOut: { $exists: false }
                }).lean()
                if (!stillOpen) continue

                const staff = await Staff.findById(ci.staffMember)
                    .select('pushSubscription staffName')
                    .lean()
                if (!staff?.pushSubscription) continue

                await sendPush(staff.pushSubscription, {
                    title: 'Time to Clock Out',
                    body:  `Hi ${staff.staffName || 'there'} — your shift ends in 5 minutes (${ci.endOfShift}). Open the app to clock out.`,
                    tag:   'clockout-reminder',
                    url:   '/staff-clock-out'
                })
            }
        } catch (err) {
            console.error('[clockout-reminder]', err.message)
        }
    })
}

module.exports = { startClockOutReminderCron }
