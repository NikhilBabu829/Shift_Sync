/**
 * Intent Router — maps structured AI output to actual database operations.
 * This is the glue between the NLP layer and the existing business logic.
 */

// Mongoose models queried and mutated by the intent handlers
const SHIFT = require('../models/shift')
const CLOCKIN = require('../models/clockIn')
const STAFF = require('../models/staff')
const SHIFT_REQUEST = require('../models/shiftRequest')
const LEAVE_REQUEST = require('../models/leaveRequest')
const STAFF_AVAILABILITY = require('../models/staffAvailability')
const TOKEN = require('../models/tokenSign')
const MANAGER = require('../models/manager')
const jwt = require('jsonwebtoken')
// Used to validate email addresses before attempting to send invite emails
const emailValidator = require('email-validator')
const { inviteMember, notifyManagerNewLeave } = require('../controllers/sendMails')
// HTML builder for staff invite emails
const { sendingToken } = require('../utils/mailHtmls')

// Google Calendar sync — keeps staff calendars in step with roster changes made via AI chat
const { createShiftEvent, deleteShiftEvent } = require('./googleCalendarService')
// Availability gate — shared with Smart Match and roster controller
const { getAvailabilityWindow } = require('./availabilityService')

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
                console.log(`[ROUTER:STAFF] Found shift ${shift._id} on ${shift.date} — marking as pending_cover`)
                shift.status = 'pending_cover'
                await shift.save()
                console.log(`[ROUTER:STAFF] Shift saved. Notifying managers for approval...`)

                // Notify all managers in real time so they can approve or reject
                try {
                    const io = require('../utils/socket').getIO()
                    io.to('managers').emit('cover_request_pending', {
                        shiftId: shift._id,
                        date: shift.date,
                        shift_start_time: shift.shift_start_time,
                        shift_end_time: shift.shift_end_time,
                        staffId: String(shift.belongs_to)
                    })
                } catch(err) { console.error('[ROUTER:STAFF] Socket emit failed:', err.message) }

                return {
                    completed: true,
                    action: intent,
                    data: { shiftId: shift._id, date: shift.date, status: 'pending_cover' },
                    message: intent === 'report_sick'
                        ? `Got it — your cover request for ${shift.date} has been sent to your manager for approval. You'll be notified once it's live.`
                        : `Your cover request for ${shift.date} has been sent to your manager for approval. You'll be notified once it's live in the Marketplace.`
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

                // Mark as pending manager approval before going live in the Marketplace
                shift.status = 'pending_cover'
                await shift.save()

                try {
                    const io = require('../utils/socket').getIO()
                    io.to('managers').emit('cover_request_pending', {
                        shiftId: shift._id,
                        date: shift.date,
                        shift_start_time: shift.shift_start_time,
                        shift_end_time: shift.shift_end_time,
                        staffId: String(shift.belongs_to)
                    })
                } catch(err) { console.error('[ROUTER:STAFF] Socket emit failed:', err.message) }

                return {
                    completed: true,
                    action: 'request_cover',
                    data: { shiftId: shift._id, date: shift.date, status: 'pending_cover' },
                    message: `Your cover request for ${shift.date} has been sent to your manager for approval. You'll be notified once it's live in the Marketplace.`
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

                // Detect time-of-day preferences in notes (e.g. "prefers morning shift")
                const TIME_OF_DAY_RE = /\b(morning|afternoon|evening|night)\b/i
                const hasTimePreference = notes && TIME_OF_DAY_RE.test(notes)

                // Prompt for the time only when no specific time AND no time-of-day preference was given
                if (!shift_time && !hasTimePreference) {
                    return {
                        completed: false,
                        action: 'request_shift',
                        data: { date },
                        message: `Got it — you'd like to work on ${date}. What time would you like to start, and when would you finish? (e.g. "9am to 5pm", "8:30 till 16:00", or "morning" / "afternoon")`
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
                console.log(`[ROUTER:STAFF] Creating shift request for staffId=${staffId} on ${date} (${shift_time || 'time TBD'}–${end_time || '?'}) notes="${notes || 'none'}"`)
                // Persist the request for manager review
                const shiftRequest = new SHIFT_REQUEST({
                    staffMember: staffId,
                    requestedDate: date,
                    requestedStartTime: shift_time || null,
                    requestedEndTime: end_time || null,
                    notes: notes || null,
                    status: 'pending'
                })
                await shiftRequest.save()

                // Build a time description: use clock times if present, otherwise surface the preference note
                let timeNote = ''
                if (shift_time) {
                    timeNote = ` (${shift_time}${end_time ? ' – ' + end_time : ''})`
                } else if (notes) {
                    timeNote = ` — ${notes}`
                }
                const managerNote = !shift_time ? ' Your manager will propose a specific time for you to review.' : ''
                return {
                    completed: true,
                    action: 'request_shift',
                    data: { requestId: shiftRequest._id, date, status: 'pending' },
                    message: `Your request to work on ${date}${timeNote} has been submitted.${managerNote}`
                }
            }

            case 'request_leave': {
                const { leaveType, startDate, endDate, notes } = parsedIntent

                if (!startDate || !endDate) {
                    return {
                        completed: false,
                        action: 'request_leave',
                        data: null,
                        message: "I'd like to submit that leave request for you — which dates do you need off? (e.g. \"June 10 to June 14\" or \"just Monday the 20th\")"
                    }
                }

                const validTypes = ['sick', 'annual', 'personal']
                const resolvedType = validTypes.includes(leaveType) ? leaveType : 'personal'

                // Prevent duplicate pending leave for overlapping dates
                const existing = await LEAVE_REQUEST.findOne({
                    staffMember: staffId,
                    status: 'pending',
                    startDate: { $lte: endDate },
                    endDate:   { $gte: startDate }
                }).lean()
                if (existing) {
                    return {
                        completed: true,
                        action: 'request_leave',
                        data: { leaveId: existing._id },
                        message: `You already have a pending leave request covering ${existing.startDate} to ${existing.endDate}. Your manager will review it shortly.`
                    }
                }

                const leave = new LEAVE_REQUEST({
                    staffMember: staffId,
                    leaveType: resolvedType,
                    startDate,
                    endDate,
                    notes: notes || null,
                    status: 'pending'
                })
                await leave.save()

                // Notify manager by email and socket (non-blocking)
                try {
                    const [staffDoc, manager] = await Promise.all([
                        STAFF.findById(staffId).select('staffName email').lean(),
                        MANAGER.findOne({}).select('email firstName').lean()
                    ])
                    if (staffDoc && manager) {
                        notifyManagerNewLeave({
                            to: manager.email,
                            managerName: manager.firstName || 'Manager',
                            staffName: staffDoc.staffName,
                            leaveType: resolvedType,
                            startDate,
                            endDate,
                            notes: notes || null,
                        })
                    }
                    const io = require('../utils/socket').getIO()
                    io.to('managers').emit('leave_request_submitted', {
                        leaveId: leave._id,
                        staffName: staffDoc?.staffName || 'A staff member',
                        leaveType: resolvedType,
                        startDate,
                        endDate,
                        notes: notes || null,
                    })
                } catch { /* non-critical */ }

                const typeLabel = { sick: 'sick leave', annual: 'annual leave', personal: 'personal leave' }[resolvedType]
                const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`
                return {
                    completed: true,
                    action: 'request_leave',
                    data: { leaveId: leave._id, leaveType: resolvedType, startDate, endDate },
                    message: `Done — I've submitted your ${typeLabel} request for ${dateRange}. Your manager will review it and you'll be notified of the decision.`
                }
            }

            case 'set_availability': {
                const { entries } = parsedIntent

                if (!Array.isArray(entries) || entries.length === 0) {
                    return {
                        completed: false,
                        action: 'set_availability',
                        data: null,
                        message: "I can update your availability — just tell me which days or dates and whether you're available (and optionally the hours). For example: \"I'm not available on weekends\" or \"I can work Monday to Friday 9am to 5pm\"."
                    }
                }

                const saved = []
                const failed = []

                for (const entry of entries) {
                    const { type, dayOfWeek, date, available, startTime, endTime } = entry
                    if (!['weekly', 'date'].includes(type)) { failed.push(`unknown type "${type}"`); continue }
                    if (type === 'weekly' && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6)) { failed.push('invalid dayOfWeek'); continue }
                    if (type === 'date' && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))) { failed.push(`invalid date "${date}"`); continue }

                    const filter = type === 'weekly'
                        ? { staffMember: staffId, type: 'weekly', dayOfWeek: Number(dayOfWeek) }
                        : { staffMember: staffId, type: 'date', date }

                    const update = {
                        available: Boolean(available),
                        startTime: available && startTime ? startTime : null,
                        endTime:   available && endTime   ? endTime   : null,
                        updatedAt: new Date()
                    }

                    try {
                        await STAFF_AVAILABILITY.findOneAndUpdate(filter, { $set: update }, { upsert: true })
                        if (type === 'weekly') {
                            const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
                            const label = available
                                ? (startTime && endTime ? `${dayNames[dayOfWeek]} ${startTime}–${endTime}` : `${dayNames[dayOfWeek]} (all day)`)
                                : `${dayNames[dayOfWeek]} (unavailable)`
                            saved.push(label)
                        } else {
                            saved.push(available ? `${date} (available${startTime && endTime ? ` ${startTime}–${endTime}` : ''})` : `${date} (unavailable)`)
                        }
                    } catch { failed.push(type === 'weekly' ? `day ${dayOfWeek}` : date) }
                }

                let message = ''
                if (saved.length > 0) message += `Your availability has been updated: ${saved.join(', ')}.`
                if (failed.length > 0) message += ` Could not update: ${failed.join(', ')}.`

                return {
                    completed: saved.length > 0,
                    action: 'set_availability',
                    data: { saved: saved.length, failed: failed.length },
                    message: message || 'No availability changes were made.'
                }
            }

            default:
                return {
                    completed: false,
                    action: 'clarification_needed',
                    data: null,
                    message: "I couldn't quite understand that. Could you rephrase? For example: \"I'm sick tomorrow\", \"I want annual leave June 10–14\", or \"I'm not available on Sundays\"."
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

                    // Block if the staff member has approved leave on this date
                    const leaveConflict = await LEAVE_REQUEST.findOne({
                        staffMember: staff._id,
                        status: 'approved',
                        startDate: { $lte: date },
                        endDate:   { $gte: date }
                    }).lean()
                    if (leaveConflict) {
                        failed.push(`${staff.staffName} on ${date} — has approved ${leaveConflict.leaveType} leave`)
                        continue
                    }

                    // Block if the staff member has declared unavailability on this date/time
                    const { isAvailableForShift } = require('./availabilityService')
                    const availCheck = await isAvailableForShift(staff._id, date, startTime, endTime)
                    if (!availCheck.available) {
                        failed.push(`${staff.staffName} on ${date} — ${availCheck.reason}`)
                        continue
                    }

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

                // Fallback shift templates used when a staff member has no declared hours
                const TEMPLATES = [
                    { start: '07:00', end: '15:30', length: 8.5 },
                    { start: '08:00', end: '16:30', length: 8.5 },
                    { start: '10:00', end: '18:30', length: 8.5 },
                    { start: '13:30', end: '22:00', length: 8.5 },
                    { start: '16:00', end: '00:30', length: 8.5 },
                ]

                const SHIFTS_PER_STAFF = 5
                const created = []
                const skipped = []
                const blocked = []

                console.log(`[ROUTER:MANAGER] generate_roster — week: ${weekDates[0]} to ${weekDates[6]} | staff: ${staffList.length}`)

                for (let i = 0; i < staffList.length; i++) {
                    const staff = staffList[i]
                    let shiftsCreated = 0

                    for (let j = 0; j < 7 && shiftsCreated < SHIFTS_PER_STAFF; j++) {
                        const date = weekDates[(i + j) % 7]

                        // Skip if shift already exists
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

                        // Skip if the staff member has approved leave on this date
                        const leaveConflict = await LEAVE_REQUEST.findOne({
                            staffMember: staff._id,
                            status: 'approved',
                            startDate: { $lte: date },
                            endDate:   { $gte: date }
                        }).lean()
                        if (leaveConflict) {
                            console.log(`[ROUTER:MANAGER]   ✗ ${staff.staffName} on ${date} — approved ${leaveConflict.leaveType} leave`)
                            blocked.push(`${staff.staffName} on ${date} (on leave)`)
                            continue
                        }

                        // Resolve the staff member's availability window for this date
                        const avail = await getAvailabilityWindow(staff._id, date)
                        if (!avail.available) {
                            console.log(`[ROUTER:MANAGER]   ✗ ${staff.staffName} on ${date} — ${avail.reason || 'unavailable'}`)
                            blocked.push(`${staff.staffName} on ${date} (unavailable)`)
                            continue
                        }

                        // Use declared hours if provided; otherwise fall back to a template
                        let startTime, endTime, shiftLength
                        if (avail.startTime && avail.endTime) {
                            startTime = avail.startTime
                            endTime   = avail.endTime
                            const [sh, sm] = startTime.split(':').map(Number)
                            const [eh, em] = endTime.split(':').map(Number)
                            shiftLength = parseFloat(((eh * 60 + em - sh * 60 - sm) / 60).toFixed(2))
                        } else {
                            const tmpl = TEMPLATES[i % TEMPLATES.length]
                            startTime   = tmpl.start
                            endTime     = tmpl.end
                            shiftLength = tmpl.length
                        }

                        console.log(`[ROUTER:MANAGER]   + ${staff.staffName} on ${date} (${startTime}–${endTime})`)
                        const newShift = await SHIFT.create({
                            belongs_to:      staff._id,
                            date,
                            shift_start_time: startTime,
                            shift_end_time:   endTime,
                            shift_length:     shiftLength,
                            status: 'filled'
                        })

                        const calEventId = await createShiftEvent(staff, newShift)
                        if (calEventId) await newShift.updateOne({ googleCalendarEventId: calEventId })

                        created.push(`${staff.staffName} on ${date}`)
                        shiftsCreated++
                    }
                }

                const weekEndDate = weekDates[6]
                console.log(`[ROUTER:MANAGER] generate_roster done — created: ${created.length}, skipped: ${skipped.length}, blocked by availability/leave: ${blocked.length}`)

                let message = `Roster generated for ${weekStart} – ${weekEndDate}: ${created.length} shift${created.length !== 1 ? 's' : ''} created across ${staffList.length} staff members.`
                if (skipped.length > 0) message += ` Skipped ${skipped.length} already-filled slot${skipped.length !== 1 ? 's' : ''}.`
                if (blocked.length > 0) message += ` Skipped ${blocked.length} slot${blocked.length !== 1 ? 's' : ''} due to declared unavailability or approved leave.`

                return {
                    completed: true,
                    action: 'generate_roster',
                    data: { weekStart, weekEnd: weekEndDate, created: created.length, skipped: skipped.length, blocked: blocked.length },
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
