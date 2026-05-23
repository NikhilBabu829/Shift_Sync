const cron = require('node-cron')
const ClockIn = require('../models/clockIn')
const Shift = require('../models/shift')
const Staff = require('../models/staff')

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'

// JS getDay() returns 0=Sun…6=Sat; Python weekday() returns 0=Mon…6=Sun.
function toPythonDow(jsDow) {
    return jsDow === 0 ? 6 : jsDow - 1
}

function parseShiftHour(timeStr) {
    if (!timeStr) return 9.0
    const parts = timeStr.split(':')
    if (parts.length !== 2) return 9.0
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    return isNaN(h) || isNaN(m) ? 9.0 : h + m / 60
}

async function runWeeklyRetrain() {
    const now = new Date()

    // Generate the date strings for the previous 7 days (dateClockedIn uses toDateString())
    const dateStrings = []
    for (let i = 1; i <= 7; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
        dateStrings.push(d.toDateString())
    }

    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Fetch clock-ins and swap shifts in parallel
    const [clockIns, swapShifts, allStaff] = await Promise.all([
        ClockIn.find({ dateClockedIn: { $in: dateStrings } })
            .select('staffMember dateClockedIn startOfShift')
            .lean(),
        Shift.find({
            swap_belongs_to: { $exists: true, $ne: null },
            shiftDate: { $gte: weekAgo },
        })
            .select('swap_belongs_to swap_shift_start_time swapDate status')
            .lean(),
        Staff.find().select('_id avgHoursPerWeek recentShiftCount').lean(),
    ])

    // Index staff metadata by id string
    const staffMeta = {}
    for (const s of allStaff) {
        staffMeta[s._id.toString()] = {
            avgHoursPerWeek: s.avgHoursPerWeek || 0,
            recentShiftCount: s.recentShiftCount || 0,
        }
    }

    // Build historicalAcceptances per staff member
    const acceptancesById = {}

    // Clock-ins → the staff member accepted/showed up (accepted = true)
    for (const ci of clockIns) {
        const id = ci.staffMember.toString()
        if (!acceptancesById[id]) acceptancesById[id] = []
        const dow = toPythonDow(new Date(ci.dateClockedIn).getDay())
        const hour = parseShiftHour(ci.startOfShift)
        acceptancesById[id].push({ dayOfWeek: dow, hour, accepted: true })
    }

    // Swap requests → approved = accepted, anything else = declined
    for (const shift of swapShifts) {
        const id = shift.swap_belongs_to.toString()
        if (!acceptancesById[id]) acceptancesById[id] = []
        const dateStr = shift.swapDate || ''
        const dow = dateStr ? toPythonDow(new Date(dateStr).getDay()) : 0
        const hour = parseShiftHour(shift.swap_shift_start_time)
        const accepted = shift.status === 'approved'
        acceptancesById[id].push({ dayOfWeek: dow, hour, accepted })
    }

    const trainingData = Object.entries(acceptancesById).map(([staffId, acceptances]) => {
        const meta = staffMeta[staffId] || { avgHoursPerWeek: 0, recentShiftCount: 0 }
        return {
            staffId,
            historicalAcceptances: acceptances,
            recentShiftCount: meta.recentShiftCount,
            avgHoursPerWeek: meta.avgHoursPerWeek,
        }
    })

    if (trainingData.length === 0) {
        console.log('[ml-retrain] No training data found for the past week — skipping.')
        return
    }

    const res = await fetch(`${ML_SERVICE_URL}/ml/retrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingData }),
    })
    if (!res.ok) {
        console.error(`[ml-retrain] ML service responded ${res.status}`)
        return
    }
    const { status, staffCount, sampleCount } = await res.json()
    console.log(`[ml-retrain] status=${status} staffCount=${staffCount} sampleCount=${sampleCount}`)
}

function startMlRetrainCron() {
    // Every Sunday at 00:00 server time
    cron.schedule('0 0 * * 0', async () => {
        try {
            await runWeeklyRetrain()
        } catch (err) {
            console.error('[ml-retrain] Retrain failed:', err.message)
        }
    })
}

module.exports = { startMlRetrainCron, runWeeklyRetrain }
