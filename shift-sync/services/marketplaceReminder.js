const cron = require('node-cron')
const SHIFT   = require('../models/shift')
const MANAGER = require('../models/manager')
const { sendPushToMany } = require('../utils/webPush')

function padHHMM(date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

// Runs every 15 minutes. Finds open_cover shifts on today's date whose start time
// falls within the next 4 hours and pushes an urgency alert to all managers.
function start() {
    cron.schedule('*/15 * * * *', async () => {
        try {
            const now     = new Date()
            const today   = now.toISOString().slice(0, 10)   // YYYY-MM-DD
            const nowHHMM = padHHMM(now)
            const in4h    = new Date(now.getTime() + 4 * 60 * 60 * 1000)
            const in4hHHMM = padHHMM(in4h)

            const urgentShifts = await SHIFT.find({
                status: 'open_cover',
                date: today,
                shift_start_time: { $gt: nowHHMM, $lte: in4hHHMM }
            }).lean()

            if (urgentShifts.length === 0) return

            const managers = await MANAGER.find().select('pushSubscriptions').lean()
            const allSubs  = managers.flatMap(m => m.pushSubscriptions || [])
            if (allSubs.length === 0) return

            for (const shift of urgentShifts) {
                sendPushToMany(allSubs, {
                    title: 'Unclaimed Shift Starting Soon',
                    body:  `Open shift on ${shift.date} (${shift.shift_start_time}–${shift.shift_end_time}) starts within 4 hours and has no cover.`,
                    icon:  '/favicon.ico',
                    tag:   `marketplace-urgent-${shift._id}`
                })
            }
        } catch (err) {
            console.error('[marketplaceReminder] error:', err.message)
        }
    })

    console.log('[marketplaceReminder] scheduled — every 15 min, 4-hour urgency window')
}

module.exports = { start }
