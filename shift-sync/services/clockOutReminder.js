const cron = require('node-cron')
const SHIFT    = require('../models/shift')
const ClockOut = require('../models/clockOut')
const STAFF    = require('../models/staff')
const { sendPush } = require('../utils/webPush')

// The three reminder windows: how many minutes before shift end each fires
const REMINDERS = [
    { minsBeforeEnd: 30, label: '30 minutes' },
    { minsBeforeEnd: 15, label: '15 minutes' },
    { minsBeforeEnd: 5,  label: '5 minutes'  },
]

function offsetTime(now, minutes) {
    const t = new Date(now.getTime() + minutes * 60 * 1000)
    return `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
}

// Runs every minute. For each reminder window, finds staff whose shift ends at
// (now + minsBeforeEnd), have clocked in today, and haven't clocked out yet.
function start() {
    cron.schedule('* * * * *', async () => {
        try {
            const now   = new Date()
            const today = now.toISOString().slice(0, 10)   // YYYY-MM-DD

            for (const { minsBeforeEnd, label } of REMINDERS) {
                const targetEndTime = offsetTime(now, minsBeforeEnd)

                // All filled/approved shifts for today ending at this target time
                const shifts = await SHIFT.find({
                    date: today,
                    shift_end_time: targetEndTime,
                    status: { $in: ['filled', 'approved'] }
                }).lean()

                if (shifts.length === 0) continue

                const staffIds = shifts.map(s => s.belongs_to)

                // Fetch push subscriptions in one query
                const staffMembers = await STAFF.find(
                    { _id: { $in: staffIds } },
                    'pushSubscription staffName'
                ).lean()
                const subMap = Object.fromEntries(staffMembers.map(s => [String(s._id), s]))

                // Only remind staff who have an open clock-out record:
                // created at clock-in time, timeClockedOut absent = clocked in but not yet out
                const openClockOuts = await ClockOut.find({
                    staffMember: { $in: staffIds },
                    timeClockedOut: { $exists: false }
                }).lean()
                const openStaffIds = new Set(openClockOuts.map(c => String(c.staffMember)))

                for (const shift of shifts) {
                    const sid   = String(shift.belongs_to)
                    const staff = subMap[sid]

                    // Skip if they haven't clocked in, already clocked out, or have no push sub
                    if (!staff?.pushSubscription || !openStaffIds.has(sid)) continue

                    await sendPush(staff.pushSubscription, {
                        title: "Don't forget to clock out!",
                        body:  `Your shift ends in ${label} (${targetEndTime}). Tap to clock out.`,
                        icon:  '/favicon.ico',
                        // Unique tag per window so all three can appear rather than replacing each other
                        tag:   `clock-out-reminder-${minsBeforeEnd}-${sid}`,
                        data:  { url: '/clock-out' }
                    })
                }
            }
        } catch (err) {
            console.error('[clockOutReminder] error:', err.message)
        }
    })

    console.log('[clockOutReminder] scheduled — 30 / 15 / 5 min reminders active')
}

module.exports = { start }
