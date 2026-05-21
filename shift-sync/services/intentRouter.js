/**
 * Intent Router — maps structured AI output to actual database operations.
 * This is the glue between the NLP layer and the existing business logic.
 */

// Mongoose models queried and mutated by the intent handlers
const SHIFT = require('../models/shift')
const CLOCKIN = require('../models/clockIn')
const STAFF = require('../models/staff')
const SHIFT_REQUEST = require('../models/shiftRequest')
const TOKEN = require('../models/tokenSign')
const jwt = require('jsonwebtoken')
// Used to validate email addresses before attempting to send invite emails
const emailValidator = require('email-validator')
const { inviteMember } = require('../controllers/sendMails')
// HTML builder for staff invite emails
const { sendingToken } = require('../utils/mailHtmls')

// Google Calendar sync — keeps staff calendars in step with roster changes made via AI chat
const { createShiftEvent, deleteShiftEvent } = require('./googleCalendarService')

// ── Staff intent router ──────────────────────────────────────────────────────

// Dispatches a parsed staff intent to the appropriate DB operation and returns a user-facing result
async function routeIntent(parsedIntent, staffId) {
    try {
        const { intent, date, shift_time, end_time, targetStaffId, notes } = parsedIntent

        // Log the intent and key fields before any DB work so failures are easy to trace
        console.log(`\n[ROUTER:STAFF] Routing intent: "${intent}" | date=${date || 'n/a'} | shift_time=${shift_time || 'n/a'}`)

        switch (intent) {

            // drop_shift and report_sick both open the shift for coverage
            case 'drop_shift':
            case 'report_sick': {
                const query = { belongs_to: staffId, status: 'filled' }
                // Narrow the search to the specified date and time if provided
                if (date) query.date = date
                if (shift_time) query.shift_start_time = shift_time

                const shift = await SHIFT.findOne(query)
                if (!shift) {
                    return {
                        completed: false,
                        action: intent,
                        data: null,
                        message: date
                            ? `No shift found for you on ${date}. Please check the date and try again.`
                            : 'Could not find a matching shift. Please specify a date.'
                    }
                }

                // Confirm which DB record was matched before mutating it
                console.log(`[ROUTER:STAFF] Found shift ${shift._id} on ${shift.date} — marking as open_cover`)
                shift.status = 'open_cover'
                await shift.save()
                console.log(`[ROUTER:STAFF] Shift saved. Triggering Smart Match async...`)

                // Trigger Smart Match asynchronously; errors are caught and logged without blocking the response
                const { findCoverCandidates } = require('./smartMatchService')
                findCoverCandidates(shift).catch((err) =>
                    console.error('Smart Match failed after drop_shift:', err.message)
                )

                return {
                    completed: true,
                    action: intent,
                    data: { shiftId: shift._id, date: shift.date, status: 'open_cover' },
                    message: intent === 'report_sick'
                        ? `Got it — your shift on ${shift.date} has been opened for coverage. Feel better soon.`
                        : `Your shift on ${shift.date} has been marked as needing cover. We'll notify available staff.`
                }
            }

            case 'request_cover': {
                const query = { belongs_to: staffId, status: 'filled' }
                if (date) query.date = date

                const shift = await SHIFT.findOne(query)
                if (!shift) {
                    return {
                        completed: false,
                        action: 'request_cover',
                        data: null,
                        message: `No shift found${date ? ` on ${date}` : ''}. Please provide a date.`
                    }
                }

                // Open for coverage and kick off Smart Match
                shift.status = 'open_cover'
                await shift.save()

                const { findCoverCandidates } = require('./smartMatchService')
                findCoverCandidates(shift).catch((err) =>
                    console.error('Smart Match failed after request_cover:', err.message)
                )

                return {
                    completed: true,
                    action: 'request_cover',
                    data: { shiftId: shift._id, date: shift.date },
                    message: `Your shift on ${shift.date} is now open for cover. The best available staff have been notified.`
                }
            }

            case 'request_swap': {
                // If no target specified, return the full staff list so the user can pick
                if (!targetStaffId) {
                    const allStaff = await STAFF.find({ _id: { $ne: staffId } }).select('staffName email _id')
                    return {
                        completed: false,
                        action: 'request_swap',
                        data: { staffList: allStaff },
                        message: 'Who would you like to swap with? Here are your teammates.'
                    }
                }

                const targetStaff = await STAFF.findById(targetStaffId).select('staffName')
                if (!targetStaff) {
                    return { completed: false, action: 'request_swap', data: null, message: 'Could not find that team member.' }
                }

                // Redirect to the dedicated swap screen for the actual date-selection workflow
                return {
                    completed: true,
                    action: 'request_swap',
                    data: { targetStaffId, targetStaffName: targetStaff.staffName },
                    message: `To swap with ${targetStaff.staffName}, please use the shift swap screen in the app with the specific dates.`
                }
            }

            case 'query_schedule': {
                // Return the next 7 upcoming filled shifts for the staff member
                const upcomingShifts = await SHIFT.find({ belongs_to: staffId, status: 'filled', date: { $gte: new Date().toISOString().split('T')[0] } })
                    .sort({ date: 1 })
                    .limit(7)
                    .lean()

                if (upcomingShifts.length > 0) {
                    const lines = upcomingShifts.map(s => `${s.date}: ${s.shift_start_time}–${s.shift_end_time}`).join(', ')
                    return {
                        completed: true,
                        action: 'query_schedule',
                        data: { shifts: upcomingShifts },
                        message: `Here are your upcoming shifts: ${lines}.`
                    }
                }

                return {
                    completed: true,
                    action: 'query_schedule',
                    data: { shifts: [] },
                    message: 'You have no upcoming shifts scheduled.'
                }
            }

            case 'request_shift': {
                // Prompt for the date if the LLM couldn't extract it
                if (!date) {
                    return {
                        completed: false,
                        action: 'request_shift',
                        data: null,
                        message: 'Which date would you like to work? Please specify the date.'
                    }
                }

                // Prompt for the time if only the date was extracted
                if (!shift_time) {
                    return {
                        completed: false,
                        action: 'request_shift',
                        data: { date },
                        message: `Got it — you'd like to work on ${date}. What time would you like to start, and when would you finish? (e.g. "9am to 5pm" or "8:30 till 16:00")`
                    }
                }

                // Prevent duplicate pending requests for the same date
                const existing = await SHIFT_REQUEST.findOne({ staffMember: staffId, requestedDate: date, status: 'pending' })
                if (existing) {
                    return {
                        completed: true,
                        action: 'request_shift',
                        data: { requestId: existing._id },
                        message: `You already have a pending shift request for ${date}. Your manager will review it shortly.`
                    }
                }

                // Confirm the values being persisted before the DB write
                console.log(`[ROUTER:STAFF] Creating shift request for staffId=${staffId} on ${date} (${shift_time}–${end_time || '?'})`)
                // Persist the request for manager review
                const shiftRequest = new SHIFT_REQUEST({
                    staffMember: staffId,
                    requestedDate: date,
                    requestedStartTime: shift_time,
                    requestedEndTime: end_time || null,
                    notes: notes || null,
                    status: 'pending'
                })
                await shiftRequest.save()

                // Include the time in the confirmation message for clarity
                const timeNote = ` (${shift_time}${end_time ? ' – ' + end_time : ''})`
                return {
                    completed: true,
                    action: 'request_shift',
                    data: { requestId: shiftRequest._id, date, status: 'pending' },
                    message: `Your request to work on ${date}${timeNote} has been submitted. Your manager will review it.`
                }
            }

            default:
                return {
                    completed: false,
                    action: 'clarification_needed',
                    data: null,
                    message: "I couldn't quite understand that. Could you rephrase? For example: \"I'm sick tomorrow\" or \"I want to work this Friday\"."
                }
        }
    } catch (err) {
        console.error('Error routing staff intent:', err)
        return {
            action: 'clarification_needed',
            data: null,
            message: 'Something went wrong. Please try again.'
        }
    }
}

// ── Manager intent router ────────────────────────────────────────────────────

// Case-insensitive staff name resolver; falls back to partial match for flexibility
function resolveStaffName(name, staffList) {
    if (!name) return null
    const lower = name.toLowerCase()
    return staffList.find(s => s.staffName.toLowerCase() === lower)
        || staffList.find(s => s.staffName.toLowerCase().includes(lower))
        || null
}

// Dispatches a parsed manager intent to the appropriate DB operation and returns a user-facing result
async function routeManagerIntent(parsedIntent, managerId, managerToken) {
    try {
        const { intent } = parsedIntent
        // Fetch the current staff list once; includes OAuth tokens so Calendar sync doesn't need extra DB calls
        const staffList = await STAFF.find({}).select('staffName _id email googleAccessToken googleRefreshToken').lean()

        // Log intent and org size before any DB work so failures have clear context
        console.log(`\n[ROUTER:MANAGER] Routing intent: "${intent}" | staff in org: ${staffList.length}`)

        switch (intent) {

            case 'invite_staff': {
                const { email, role, department } = parsedIntent
                // Validate email before creating a token or sending mail
                if (!email || !emailValidator.validate(email)) {
                    return {
                        completed: false,
                        action: 'invite_staff',
                        data: null,
                        message: email
                            ? `"${email}" doesn't look like a valid email address. Please double-check.`
                            : 'Please provide the email address of the person you want to invite.'
                    }
                }

                // Sign the manager's JWT inside an invite-specific token for secure acceptance
                const tokenSign = jwt.sign({ signed: managerToken }, process.env.JWT_INVITE_SECRET, { expiresIn: '24h' })
                const tokenEntry = new TOKEN({
                    token: tokenSign,
                    email,
                    role: role || 'Staff Member',
                    department: department || 'General',
                    message: ''
                })
                await tokenEntry.save()

                // Build and send the invite email
                const mailHTML = sendingToken(tokenEntry._id)
                const inviteResponse = await inviteMember({
                    to: email,
                    subject: "You've been invited to Shift Sync",
                    text: '',
                    html: mailHTML
                })

                const sent = inviteResponse?.accepted?.length > 0
                return {
                    completed: sent,
                    action: 'invite_staff',
                    data: sent ? { email, role: role || 'Staff Member', department: department || 'General' } : null,
                    message: sent
                        ? `Invite sent to ${email} as ${role || 'Staff Member'} in ${department || 'General'}.`
                        : `Failed to send the invite to ${email}. Please try again or use the Invite Staff page.`
                }
            }

            case 'create_roster_shift': {
                const { shifts } = parsedIntent
                if (!Array.isArray(shifts) || shifts.length === 0) {
                    return {
                        completed: false,
                        action: 'create_roster_shift',
                        data: null,
                        message: 'I could not extract any shift details. Please specify the staff member, date, start time, and end time.'
                    }
                }

                // Log batch size upfront so it's obvious how many DB writes are expected
                console.log(`[ROUTER:MANAGER] create_roster_shift — processing ${shifts.length} shift(s)`)
                const created = []
                const failed = []

                for (const s of shifts) {
                    const { staffName, date, startTime, endTime } = s
                    // Collect failures without aborting the whole batch
                    if (!date || !startTime || !endTime) { failed.push(`${staffName || 'unknown'} on ${date || '?'} — missing time`); continue }
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { failed.push(`${staffName} — invalid date format`); continue }

                    const staff = resolveStaffName(staffName, staffList)
                    if (!staff) { console.log(`[ROUTER:MANAGER]   ✗ "${staffName}" not found in staff list`); failed.push(`${staffName || 'unknown'} — staff member not found`); continue }
                    console.log(`[ROUTER:MANAGER]   + Creating shift for ${staff.staffName} on ${date} (${startTime}–${endTime})`)

                    // Compute shift length in hours from the HH:MM strings
                    const [sh, sm] = startTime.split(':').map(Number)
                    const [eh, em] = endTime.split(':').map(Number)
                    const shiftLength = parseFloat(((eh * 60 + em - (sh * 60 + sm)) / 60).toFixed(2))

                    const newShift = new SHIFT({
                        belongs_to: staff._id,
                        date,
                        shift_start_time: startTime,
                        shift_end_time: endTime,
                        shift_length: shiftLength,
                        status: 'filled'
                    })
                    await newShift.save()

                    // Mirror the shift in the staff member's Google Calendar
                    const calEventId = await createShiftEvent(staff, newShift)
                    if (calEventId) {
                        newShift.googleCalendarEventId = calEventId
                        await newShift.save()
                    }

                    created.push(`${staff.staffName} on ${date} (${startTime}–${endTime})`)
                }

                // Summary after all writes so the outcome is clear at a glance
                console.log(`[ROUTER:MANAGER] create_roster_shift done — created: ${created.length}, failed: ${failed.length}`)
                // Build a combined summary message covering both successes and failures
                let message = ''
                if (created.length > 0) message += `Created ${created.length} shift${created.length > 1 ? 's' : ''}: ${created.join('; ')}.`
                if (failed.length > 0) message += ` Could not create: ${failed.join('; ')}.`

                return {
                    completed: created.length > 0,
                    action: 'create_roster_shift',
                    data: { created: created.length, failed: failed.length },
                    message: message || 'No shifts were created.'
                }
            }

            case 'remove_roster_shift': {
                const { staffName, date } = parsedIntent
                // Date is the minimum required to identify a shift
                if (!date) {
                    return {
                        completed: false,
                        action: 'remove_roster_shift',
                        data: null,
                        message: 'Please specify the date of the shift you want to remove.'
                    }
                }

                // Build the query; optionally narrow by staff member name
                const query = { date, status: 'filled' }
                if (staffName) {
                    const staff = resolveStaffName(staffName, staffList)
                    if (!staff) {
                        return { completed: false, action: 'remove_roster_shift', data: null, message: `Could not find staff member "${staffName}".` }
                    }
                    query.belongs_to = staff._id
                }

                const shift = await SHIFT.findOne(query)
                if (!shift) {
                    return {
                        completed: false,
                        action: 'remove_roster_shift',
                        data: null,
                        message: staffName
                            ? `No filled shift found for ${staffName} on ${date}.`
                            : `No filled shift found on ${date}.`
                    }
                }

                // Remove the Google Calendar event before deleting the shift document
                if (shift.googleCalendarEventId) {
                    const staffDoc = staffList.find(s => String(s._id) === String(shift.belongs_to))
                    if (staffDoc) await deleteShiftEvent(staffDoc, shift.googleCalendarEventId)
                }

                await shift.deleteOne()
                return {
                    completed: true,
                    action: 'remove_roster_shift',
                    data: { shiftId: shift._id, date },
                    message: staffName
                        ? `Shift for ${staffName} on ${date} has been removed.`
                        : `Shift on ${date} has been removed.`
                }
            }

            case 'query_roster': {
                const { from, to, staffName } = parsedIntent
                const query = { status: 'filled' }
                // Apply optional date range filter
                if (from || to) {
                    query.date = {}
                    if (from) query.date.$gte = from
                    if (to) query.date.$lte = to
                }
                // Optionally filter to a single staff member
                if (staffName) {
                    const staff = resolveStaffName(staffName, staffList)
                    if (staff) query.belongs_to = staff._id
                }

                // Cap results at 50 to avoid excessively large AI responses
                const shifts = await SHIFT.find(query)
                    .populate('belongs_to', 'staffName')
                    .sort({ date: 1, shift_start_time: 1 })
                    .limit(50)
                    .lean()

                if (shifts.length === 0) {
                    const period = from ? `from ${from}${to ? ' to ' + to : ''}` : 'for the requested period'
                    return {
                        completed: true,
                        action: 'query_roster',
                        data: { shifts: [] },
                        message: `No shifts found ${period}.`
                    }
                }

                // Summarise all shifts in a single human-readable string for the AI reply
                const lines = shifts.map(s => `${s.date} — ${s.belongs_to?.staffName || 'Unknown'} (${s.shift_start_time}–${s.shift_end_time})`).join('; ')
                return {
                    completed: true,
                    action: 'query_roster',
                    data: { shifts },
                    message: `Found ${shifts.length} shift${shifts.length > 1 ? 's' : ''}: ${lines}.`
                }
            }

            case 'generate_roster': {
                let { weekStart } = parsedIntent

                // Fall back to next Monday if the LLM didn't resolve a date
                if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
                    const today = new Date()
                    const dow = today.getUTCDay()
                    const daysUntilNextMonday = dow === 0 ? 1 : 8 - dow
                    const nextMonday = new Date(today)
                    nextMonday.setUTCDate(today.getUTCDate() + daysUntilNextMonday)
                    weekStart = nextMonday.toISOString().split('T')[0]
                }

                // Build Mon–Sun date strings for the target week
                const baseDate = new Date(weekStart)
                const weekDates = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(baseDate)
                    d.setUTCDate(baseDate.getUTCDate() + i)
                    return d.toISOString().split('T')[0]
                })

                if (staffList.length === 0) {
                    return {
                        completed: false,
                        action: 'generate_roster',
                        data: null,
                        message: 'No staff members found. Please add staff before generating a roster.'
                    }
                }

                // Five shift templates that spread coverage across the full day
                const TEMPLATES = [
                    { start: '07:00', end: '15:30', length: 8.5 },
                    { start: '08:00', end: '16:30', length: 8.5 },
                    { start: '10:00', end: '18:30', length: 8.5 },
                    { start: '13:30', end: '22:00', length: 8.5 },
                    { start: '16:00', end: '00:30', length: 8.5 },
                ]

                // Each staff member is assigned 5 shifts; the starting day is offset by their
                // position in the list so different staff cover different day combinations.
                const SHIFTS_PER_STAFF = 5
                const created = []
                const skipped = []

                // Log the week range and scale so it's easy to spot if the wrong week was resolved
                console.log(`[ROUTER:MANAGER] generate_roster — week: ${weekDates[0]} to ${weekDates[6]} | staff: ${staffList.length} | shifts per person: ${SHIFTS_PER_STAFF}`)

                for (let i = 0; i < staffList.length; i++) {
                    const staff = staffList[i]
                    const template = TEMPLATES[i % TEMPLATES.length]

                    for (let j = 0; j < SHIFTS_PER_STAFF; j++) {
                        const date = weekDates[(i + j) % 7]

                        const exists = await SHIFT.findOne({
                            belongs_to: staff._id,
                            date,
                            status: { $in: ['filled', 'approved'] }
                        })
                        if (exists) {
                            console.log(`[ROUTER:MANAGER]   ~ Skipping ${staff.staffName} on ${date} (shift already exists)`)
                            skipped.push(`${staff.staffName} on ${date}`)
                            continue
                        }

                        console.log(`[ROUTER:MANAGER]   + ${staff.staffName} on ${date} (${template.start}–${template.end})`)
                        const newShift = await SHIFT.create({
                            belongs_to: staff._id,
                            date,
                            shift_start_time: template.start,
                            shift_end_time:   template.end,
                            shift_length:     template.length,
                            status: 'filled'
                        })

                        // Mirror each generated shift in the staff member's Google Calendar
                        const calEventId = await createShiftEvent(staff, newShift)
                        if (calEventId) await newShift.updateOne({ googleCalendarEventId: calEventId })

                        created.push(`${staff.staffName} on ${date}`)
                    }
                }

                const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
                const weekEndDate = weekDates[6]
                // Final tally — makes it obvious whether any slots were already occupied
                console.log(`[ROUTER:MANAGER] generate_roster done — created: ${created.length}, skipped: ${skipped.length}`)
                let message = `Roster generated for ${weekStart} – ${weekEndDate}: ${created.length} shift${created.length !== 1 ? 's' : ''} created across ${staffList.length} staff members.`
                if (skipped.length > 0) {
                    message += ` Skipped ${skipped.length} slot${skipped.length !== 1 ? 's' : ''} that already had a shift.`
                }

                return {
                    completed: true,
                    action: 'generate_roster',
                    data: { weekStart, weekEnd: weekEndDate, created: created.length, skipped: skipped.length },
                    message
                }
            }

            default:
                return {
                    completed: false,
                    action: 'clarification_needed',
                    data: null,
                    message: "I'm not sure what you'd like to do. You can ask me to invite staff, create roster shifts, remove a shift, check the roster, or generate a full week's roster automatically."
                }
        }
    } catch (err) {
        console.error('Error routing manager intent:', err)
        return {
            action: 'clarification_needed',
            data: null,
            message: 'Something went wrong. Please try again.'
        }
    }
}

module.exports = { routeIntent, routeManagerIntent }
