
// Mongoose models used across manager operations
const MANAGER = require('../models/manager')
const SHIFT = require('../models/shift')
const STAFF = require("../models/staff")
const CLOCKOUT = require("../models/clockOut")
const CLOCKIN = require("../models/clockIn")
const TOKEN = require('../models/tokenSign')
const SHIFT_REQUEST = require('../models/shiftRequest')
const bcrypt = require('bcryptjs')
const passport = require('passport')
// Wraps async route handlers and forwards thrown errors to Express error handler
const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')

// Excel workbook builder for the attendance export
const ExcelJS = require('exceljs')

// Validates email address format before sending invites
const emailValidator = require('email-validator')

// Mail-sending helpers for invite and swap-approval emails
const {inviteMember, managerConfirmationEmail} = require('./sendMails')

// Google Calendar integration — creates/deletes events on staff members' calendars
const { createShiftEvent, deleteShiftEvent } = require('../services/googleCalendarService')
const { sendPush, sendPushToMany } = require('../utils/webPush')

// HTML template builders for outgoing emails
const { sendingToken, managerConfirmationMail } = require('../utils/mailHtmls')

// Creates a new manager account and organisation; hashes the password before storing
exports.manager_sign_up = asyncHandler(async (req, res, next)=>{
    const { first_name, last_name, email, password, org_name, hq_lat, hq_lng, rosterType, roles } = req.body
    // Prevent duplicate accounts for the same email
    const check = await MANAGER.findOne({email : email})
    if(check){
        return res.status(400).json({ message: "An account with this email already exists." })
    }
    else{
        bcrypt.hash(password, 15, async(err, hashedPassword)=>{
            if(err){
                res.json(err)
            }
            else{
                const manager = new MANAGER({
                    first_name,
                    last_name,
                    email,
                    password : hashedPassword,
                    manager : true,
                    org_name : org_name || '',
                    hq_coordinates : {
                        lat : hq_lat ? parseFloat(hq_lat) : null,
                        lng : hq_lng ? parseFloat(hq_lng) : null
                    },
                    // Default to weekly roster if an unrecognised type is submitted
                    rosterType : ['weekly', 'monthly'].includes(rosterType) ? rosterType : 'weekly',
                    roles : Array.isArray(roles) ? roles.map(r => String(r).trim()).filter(Boolean) : []
                })
                await manager.save()
                res.status(200).json({"message" : "Organisation registered successfully", manager})
            }
        })
    }
})

// Sends invite email(s) to one or more email addresses; creates a signed invite token per address
exports.manager_invite = asyncHandler(async (req, res)=>{
    console.log("Manager Invite has begun")
    const{ to, role, department, message } = req.body

    // Support both single string and array of emails
    const emails = Array.isArray(to) ? to : [to]
    const results = []

    try{
        const authHeader = req.headers['authorization']
        // Extract the raw manager JWT to embed inside the invite token
        const managerToken = authHeader && authHeader.split(" ")[1]

        for (const email of emails) {
            // Skip and record failure for any malformed email addresses
            if (!emailValidator.validate(email)) {
                results.push({ email, status: 'error', message: 'Invalid email format' })
                continue
            }

            // Sign the manager token inside an invite-specific JWT so it can be verified on acceptance
            const tokenSign = jwt.sign({signed : managerToken}, process.env.JWT_INVITE_SECRET ,{expiresIn : '24h'})

            // Persist the invite token so the acceptance route can retrieve and validate it
            const tokenEntry = new TOKEN({
                token : tokenSign,
                email : email,
                role : role || 'Staff Member',
                department : department || 'General',
                message : message || ''
            })
            await tokenEntry.save()
            console.log(tokenEntry)

            // Build the invite HTML email using the token's DB id as the unique link
            const mailHTML = sendingToken(tokenEntry._id)

            const inviteResponse = await inviteMember({
                to : email,
                subject : "You've been invited to Shift Sync",
                text : message || "",
                html : mailHTML
            })

            if(inviteResponse.accepted && inviteResponse.accepted.length > 0){
                results.push({ email, status: 'success', messageId: inviteResponse.messageId })
            } else {
                results.push({ email, status: 'error', message: 'Mail was not accepted by the server' })
            }
        }

        // Return 200 if at least one invite was accepted by the SMTP server
        const anySuccess = results.some(r => r.status === 'success')
        if (anySuccess) {
            return res.status(200).json({
                message : "Invitations processed",
                results
            })
        } else {
            return res.status(400).json({
                message : "Failed to send any invitations",
                results
            })
        }
    }catch(err){
        res.status(400).json({
            message : "Failed to process invitations, please try again later",
            err : err.message
        })
    }
})

// Returns all pending invite tokens sorted newest-first
exports.get_pending_invitations = asyncHandler(async (req, res) => {
    try {
        const pending = await TOKEN.find().sort({ createdAt: -1 })
        res.status(200).json({ pending })
    } catch (err) {
        res.status(500).json({ message: "Server error retrieving pending invitations", err: err.message })
    }
})

// Permanently deletes an invite token so the link can no longer be used
exports.revoke_invitation = asyncHandler(async (req, res) => {
    const { id } = req.params
    try {
        const deleted = await TOKEN.findByIdAndDelete(id)
        if (!deleted) return res.status(404).json({ message: "Invitation not found" })
        res.status(200).json({ message: "Invitation revoked successfully" })
    } catch (err) {
        res.status(500).json({ message: "Server error revoking invitation", err: err.message })
    }
})

// Re-sends the invite email for an existing (un-expired) token
exports.resend_invitation = asyncHandler(async (req, res) => {
    const { id } = req.params
    try {
        const invite = await TOKEN.findById(id)
        if (!invite) return res.status(404).json({ message: "Invitation not found" })

        // Rebuild the email HTML with the same token id so the link still works
        const mailHTML = sendingToken(invite._id)
        const inviteResponse = await inviteMember({
            to : invite.email,
            subject : "Reminder: You've been invited to Shift Sync",
            text : invite.message || "",
            html : mailHTML
        })

        if(inviteResponse.accepted && inviteResponse.accepted.length > 0){
            res.status(200).json({ message: "Invitation resent successfully" })
        } else {
            res.status(400).json({ message: "Failed to resend invitation" })
        }
    } catch (err) {
        res.status(500).json({ message: "Server error resending invitation", err: err.message })
    }
})

// Returns all shifts in pending_swap status that have a swap partner, for manager review
exports.getPendingSwaps = asyncHandler(async (req, res)=>{
    try{
        const pendingSwaps = await SHIFT.find({status: 'pending_swap', swap_belongs_to: { $exists: true, $ne: null }})
            .populate('belongs_to', 'staffName email')
            .populate('swap_belongs_to', 'staffName email')
            .lean()
        res.status(200).json({ pendingSwaps })
    } catch(err) {
        console.log(err)
        res.status(500).json({ message: "Server error retrieving pending swaps", err })
    }
})

// Manager approves a swap — sends confirmation emails to both parties and marks the shift as approved
exports.swapFinalApproval = asyncHandler(async (req, res)=>{
    const {id} = req.params
    try{
        const shiftDetails = await SHIFT.findById(id)
        if(shiftDetails){
            const staffA = await STAFF.findById(shiftDetails.belongs_to)
            const staffB = await STAFF.findById(shiftDetails.swap_belongs_to)
            const Manager = await MANAGER.findById(req.user.id)
            // Normalise a stored date value to a readable string, forcing local-time
            // interpretation so YYYY-MM-DD strings don't shift a day in non-UTC zones
            const toDateStr = (v) => {
                if (!v) return ''
                if (v instanceof Date) return v.toDateString()
                const s = String(v)
                const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
                return isNaN(d) ? s : d.toDateString()
            }
            const shift = {
                date : toDateStr(shiftDetails.date),
                shift_start_time : shiftDetails.shift_start_time,
                shift_end_time : shiftDetails.shift_end_time,
                swapDate : toDateStr(shiftDetails.swapDate),
                swap_shift_start_time : shiftDetails.swap_shift_start_time,
                swap_shift_end_time : shiftDetails.swap_shift_end_time
            }
            if(staffA && staffB){
                // Build personalised HTML email bodies for each staff member
                const staffABodyHTML = managerConfirmationMail({to : staffA, staffB : staffB, manager_name : Manager.first_name, shiftDetails : shift})
                const staffBBodyHTML = managerConfirmationMail({to : staffB, staffB : staffA, manager_name : Manager.first_name, shiftDetails : shift})
                const mailToStaffA = await managerConfirmationEmail({data : {to : staffA, bodyHTML : staffABodyHTML}})
                const mailToStaffB = await managerConfirmationEmail({data : {to : staffB, bodyHTML : staffBBodyHTML}})
                if((mailToStaffA.accepted && mailToStaffA.accepted.length > 0) && (mailToStaffB.accepted && mailToStaffB.accepted.length > 0)){
                    // Only update the DB status after both emails are confirmed delivered
                    await SHIFT.findByIdAndUpdate(id, { status: 'approved' })

                    // Push notification to both staff members — their swap is now approved
                    const swapDate = shift.swapDate || shift.date
                    sendPush(staffA.pushSubscription, {
                        title: 'Shift Swap Approved',
                        body: `Your swap with ${staffB.staffName} has been approved by your manager.`,
                        icon: '/favicon.ico',
                        tag: `swap-approved-${id}`
                    })
                    sendPush(staffB.pushSubscription, {
                        title: 'Shift Swap Approved',
                        body: `Your swap with ${staffA.staffName} has been approved by your manager.`,
                        icon: '/favicon.ico',
                        tag: `swap-approved-${id}`
                    })

                    // Real-time in-app notification to both staff via Socket.io
                    try {
                        const io = require('../utils/socket').getIO()
                        io.to(`staff_${staffA._id}`).emit('swap_approved', {
                            withName: staffB.staffName,
                            date: shift.date,
                            swapDate: shift.swapDate
                        })
                        io.to(`staff_${staffB._id}`).emit('swap_approved', {
                            withName: staffA.staffName,
                            date: shift.swapDate,
                            swapDate: shift.date
                        })
                    } catch { /* socket may not be initialised in test environments */ }

                    // Normalise a stored date value to YYYY-MM-DD using local-time components
                    // so it never shifts a day due to UTC conversion in non-UTC timezones
                    const toISO = (v) => {
                        if (!v) return null
                        const s = String(v)
                        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
                        const d = v instanceof Date ? v : (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s))
                        if (isNaN(d)) return null
                        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                    }
                    const dateA = toISO(shiftDetails.date)       // Staff A's original date
                    const dateB = toISO(shiftDetails.swapDate)   // Staff B's original date

                    // Try to find the existing filled roster shifts (best-effort — used to delete old
                    // calendar events and update roster ownership, but calendar creation never blocks on them)
                    const shiftA = dateA ? await SHIFT.findOne({ belongs_to: staffA._id, date: dateA, status: 'filled' }) : null
                    const shiftB = dateB ? await SHIFT.findOne({ belongs_to: staffB._id, date: dateB, status: 'filled' }) : null

                    if (!shiftA || !shiftB) {
                        console.warn(`[Swap] Roster shift not found — dateA: ${dateA} shiftA: ${!!shiftA}, dateB: ${dateB} shiftB: ${!!shiftB}. Calendar events will be created from swap data.`)
                    }

                    // Build shift-like objects from the swap document to use when the filled roster
                    // shift can't be located — all data needed for the calendar event is embedded in
                    // the swap request document
                    const shiftAData = shiftA || {
                        date: dateA,
                        shift_start_time: shiftDetails.shift_start_time,
                        shift_end_time: shiftDetails.shift_end_time
                    }
                    const shiftBData = shiftB || {
                        date: dateB,
                        shift_start_time: shiftDetails.swap_shift_start_time,
                        shift_end_time: shiftDetails.swap_shift_end_time
                    }

                    // Delete Staff A's old Calendar event then create one for Staff B on that date
                    if (shiftA?.googleCalendarEventId) await deleteShiftEvent(staffA, shiftA.googleCalendarEventId)
                    const newIdA = await createShiftEvent(staffB, shiftAData)
                    if (shiftA) {
                        shiftA.belongs_to = staffB._id
                        shiftA.googleCalendarEventId = newIdA || null
                        await shiftA.save()
                    }

                    // Delete Staff B's old Calendar event then create one for Staff A on that date
                    if (shiftB?.googleCalendarEventId) await deleteShiftEvent(staffB, shiftB.googleCalendarEventId)
                    const newIdB = await createShiftEvent(staffA, shiftBData)
                    if (shiftB) {
                        shiftB.belongs_to = staffA._id
                        shiftB.googleCalendarEventId = newIdB || null
                        await shiftB.save()
                    }

                    return res.status(200).json({
                        message : "Mail has been sent successfully"
                    })
                }else{
                    return res.status(400).json({
                        message : "Mail Delivery Has Failed, please try again!"
                    })
                }
            }
        }
    }catch(err){
        console.log(err)
        res.status(400).json({
            message : "Something went Wrong",
            err : err
        })
    }
})

// Deletes the pending swap shift record, effectively denying the swap
exports.denySwap = asyncHandler(async (req, res) => {
    const { id } = req.params
    await SHIFT.findByIdAndDelete(id)
    return res.status(200).json({ message: 'Swap request denied' })
})

// Returns all staff with basic profile fields for the manager's staff directory
exports.getManagerStaff = asyncHandler(async (req, res) => {
    const staff = await STAFF.find({}, 'staffName email department role').lean()
    return res.status(200).json({ staff })
})

// Returns filled roster shifts optionally filtered by date range
exports.getRoster = asyncHandler(async (req, res) => {
    const { from, to } = req.query
    // Exclude swap-side shifts so only the primary assigned shifts are shown
    const filter = { status: 'filled', swap_belongs_to: { $exists: false } }
    if (from || to) {
        filter.date = {}
        if (from) filter.date.$gte = from
        if (to) filter.date.$lte = to
    }
    const roster = await SHIFT.find(filter)
        .populate('belongs_to', 'staffName')
        .lean()
    return res.status(200).json({ roster })
})

// Creates a single filled roster shift for a staff member
exports.addRosterShift = asyncHandler(async (req, res) => {
    const { staffId, date, startTime, endTime } = req.body
    if (!staffId || !date || !startTime || !endTime) {
        return res.status(400).json({ message: 'staffId, date, startTime, and endTime are required' })
    }
    // Enforce ISO date format to keep queries consistent
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'date must be in YYYY-MM-DD format' })
    }
    const newShift = new SHIFT({
        belongs_to: staffId,
        date,
        shift_start_time: startTime.trim(),
        shift_end_time: endTime.trim(),
        status: 'filled'
    })
    await newShift.save()

    // Mirror the shift in the staff member's Google Calendar if they have connected tokens
    const staffMember = await STAFF.findById(staffId)
    if (staffMember) {
        const calEventId = await createShiftEvent(staffMember, newShift)
        if (calEventId) {
            newShift.googleCalendarEventId = calEventId
            await newShift.save()
        }
    }

    // Populate staff name so the response mirrors what the roster GET returns
    await newShift.populate('belongs_to', 'staffName')
    return res.status(200).json({ shift: newShift, message: 'Shift added to roster' })
})

// Deletes a roster shift by id and removes the matching Google Calendar event
exports.removeRosterShift = asyncHandler(async (req, res) => {
    const { id } = req.params
    const shift = await SHIFT.findById(id)
    if (shift) {
        if (shift.googleCalendarEventId) {
            const staffMember = await STAFF.findById(shift.belongs_to)
            if (staffMember) await deleteShiftEvent(staffMember, shift.googleCalendarEventId)
        }
        await shift.deleteOne()
    }
    return res.status(200).json({ message: 'Shift removed from roster' })
})

// Builds the live attendance ledger for today — each row includes status (ON TIME/LATE/OVERTIME)
exports.getTodayLedger = asyncHandler(async (req, res) => {
    const today = new Date().toDateString()
    const records = await CLOCKIN.find({ dateClockedIn: today })
        .populate('staffMember', 'staffName role department')
        .lean()
    const clockInIds = records.map(r => r._id)
    const clockOuts = await CLOCKOUT.find({ clockInRecord: { $in: clockInIds } }).lean()
    // Index clock-outs by their matching clock-in id for O(1) lookup
    const clockOutMap = {}
    for (const co of clockOuts) {
        clockOutMap[String(co.clockInRecord)] = co.timeClockedOut
    }
    const now = new Date()
    const ledger = records.map(r => {
        const timeClockedOut = clockOutMap[String(r._id)]
        let status = r.isLate ? 'LATE IN' : 'ON TIME'
        // Detect overtime: shift end has passed but the staff member hasn't clocked out
        if (r.endOfShift && !timeClockedOut) {
            const [endH, endM] = r.endOfShift.split(':').map(Number)
            const shiftEnd = new Date()
            shiftEnd.setHours(endH, endM, 0, 0)
            if (now > shiftEnd) status = 'OVERTIME'
        }
        return {
            _id: r._id,
            name: r.staffMember?.staffName || 'Unknown',
            role: r.staffMember?.role || '',
            dept: r.staffMember?.department || '',
            shift: `${r.startOfShift || ''} – ${r.endOfShift || ''}`,
            status,
            timeClockedIn: r.timeClockedIn,
            timeClockedOut: timeClockedOut || null,
        }
    })
    return res.status(200).json({ ledger, date: today })
})

// Returns the last 7 days of attendance counts alongside the target headcount
exports.getWeeklyAttendance = asyncHandler(async (req, res) => {
    // Build an array of the past 7 days (oldest first) for the chart x-axis
    const days = []
    for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push({
            label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase().slice(0, 3),
            dateStr: d.toDateString()
        })
    }
    const records = await CLOCKIN.find({ dateClockedIn: { $in: days.map(d => d.dateStr) } }).lean()
    // Count clock-ins per date string
    const countMap = {}
    for (const r of records) {
        countMap[r.dateClockedIn] = (countMap[r.dateClockedIn] || 0) + 1
    }
    const staffCount = await STAFF.countDocuments()
    const result = days.map(d => ({ day: d.label, actual: countMap[d.dateStr] || 0, target: staffCount }))
    return res.status(200).json({ weeklyAttendance: result })
})

// Returns how many staff are currently clocked in (on-shift) vs total staff count
exports.getShiftStats = asyncHandler(async (req, res) => {
    const today = new Date().toDateString()
    const clockInsToday = await CLOCKIN.find({ dateClockedIn: today }, '_id').lean()
    const clockInIds = clockInsToday.map(c => c._id)
    // Staff who have both clocked in and clocked out are no longer on-shift
    const clockedOutCount = await CLOCKOUT.countDocuments({
        clockInRecord: { $in: clockInIds },
        timeClockedOut: { $exists: true, $ne: null }
    })
    const total = await STAFF.countDocuments()
    return res.status(200).json({ onShift: Math.max(0, clockInsToday.length - clockedOutCount), total })
})

// Returns the organisation's custom role list stored on the manager's document
exports.getOrgRoles = asyncHandler(async (req, res) => {
    const manager = await MANAGER.findById(req.user.id).select('roles')
    return res.status(200).json({ roles: manager?.roles || [] })
})

// Appends a new role to the manager's roles array, rejecting duplicates
exports.addOrgRole = asyncHandler(async (req, res) => {
    const role = String(req.body.role || '').trim()
    if (!role) return res.status(400).json({ message: 'Role name is required.' })
    const manager = await MANAGER.findById(req.user.id).select('roles')
    if (manager.roles.includes(role)) return res.status(409).json({ message: 'Role already exists.' })
    manager.roles.push(role)
    await manager.save()
    return res.status(200).json({ roles: manager.roles, message: 'Role added.' })
})

// Removes a single role from the manager's roles array using $pull
exports.removeOrgRole = asyncHandler(async (req, res) => {
    const role = String(req.body.role || '').trim()
    if (!role) return res.status(400).json({ message: 'Role name is required.' })
    const manager = await MANAGER.findByIdAndUpdate(
        req.user.id,
        { $pull: { roles: role } },
        { new: true }
    ).select('roles')
    return res.status(200).json({ roles: manager?.roles || [], message: 'Role removed.' })
})

// Generates and streams an Excel attendance export filtered by date range and/or role
exports.download_attendance = asyncHandler(async (req, res)=>{

    try{
        const { startDate, endDate, role } = req.query;

        // Optionally filter staff by role before fetching their clock-in records
        let staffFilter = {};
        if (role) {
            staffFilter.role = role;
        }

        const allStaffMembers = await STAFF.find(staffFilter).lean()
        const staffIds = allStaffMembers.map(s => s._id);

        // Build a date-range filter for both clock-in and clock-out queries
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = { $gte: startDate, $lte: endDate };
        } else if (startDate) {
            dateFilter = { $gte: startDate };
        } else if (endDate) {
            dateFilter = { $lte: endDate };
        }

        let clockInFilter = { staffMember: { $in: staffIds } };
        if (Object.keys(dateFilter).length > 0) {
            clockInFilter.dateClockedIn = dateFilter;
        }

        const allClockInDetails = await CLOCKIN.find(clockInFilter).populate('staffMember', 'staffName email').lean()

        // Get the distinct dates present so we can create one column per date
        const gettingOnlyClockInDates = await CLOCKIN.distinct('dateClockedIn', clockInFilter)

        let clockOutFilter = { staffMember: { $in: staffIds } };
        if (Object.keys(dateFilter).length > 0) {
            clockOutFilter.dateClockedOut = dateFilter;
        }
        const allClockOutDetails = await CLOCKOUT.find(clockOutFilter).populate('staffMember', 'staffName email').lean()

        console.log(gettingOnlyClockInDates)

        // Create a new Excel workbook for the export
        const workBook = new ExcelJS.Workbook()
        workBook.creator = 'Shift Sync Server'
        workBook.created = new Date()

        const staffSheet = workBook.addWorksheet('Staff Members')

        // Sort dates chronologically so columns read left-to-right in time order
        gettingOnlyClockInDates.sort()

        // First column is staff name; subsequent columns are date-specific clock-in/out values
        staffSheet.columns = [
            {header : "Staff Name", key : "staffName", width : 30},
            ...gettingOnlyClockInDates.map((date, index)=>(
                {header : date, key : `in_${index}`, width : 20}))
        ]

        // Build lookup: staffId → { clockInRecordId → timeClockedOut }
        const clockOutMap = {}
        for(const record of allClockOutDetails){
            const staffId = String(record.staffMember._id)
            if(!clockOutMap[staffId]) clockOutMap[staffId] = {}
            // key by the clockIn record's linked date via clockInRecord — use dateClockedOut as fallback
            clockOutMap[staffId][String(record.clockInRecord)] = record.timeClockedOut
        }

        // Build lookup: staffId → { date → "clockIn – clockOut" formatted string }
        const attendanceMap = {}
        for(const record of allClockInDetails){
            const staffId = String(record.staffMember._id)
            if(!attendanceMap[staffId]) attendanceMap[staffId] = {}
            const clockOut = clockOutMap[staffId]?.[String(record._id)]
            attendanceMap[staffId][record.dateClockedIn] = clockOut
                ? `${record.timeClockedIn} – ${clockOut}`
                : record.timeClockedIn
        }

        // One row per staff member
        for(const staff of allStaffMembers){
            const staffId = String(staff._id)
            const row = { staffName : staff.staffName }
            // Fill each date column with the formatted attendance string or empty string
            gettingOnlyClockInDates.forEach((date, index) => {
                row[`in_${index}`] = attendanceMap[staffId]?.[date] || ''
            })
            staffSheet.addRow(row)
        }

        // Set response headers so the browser treats the response as a file download
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="attendance_export.xlsx"'
        )
        // Stream the workbook directly into the HTTP response
        await workBook.xlsx.write(res)
        res.end()
    }catch(err){
        console.log(err)
    }
})

// Returns shift requests that need manager attention: new pending requests and staff-agreed proposals awaiting confirmation
exports.getPendingShiftRequests = asyncHandler(async (req, res) => {
    const requests = await SHIFT_REQUEST.find({ status: { $in: ['pending', 'staff_agreed'] } })
        .populate('staffMember', 'staffName email role department')
        .sort({ createdAt: 1 })
        .lean()
    return res.status(200).json({ requests })
})

// Sends a time proposal back to the staff member instead of directly approving their request.
// The request moves to 'proposed' status and the staff member can then accept or decline.
exports.proposeShiftTime = asyncHandler(async (req, res) => {
    const { id } = req.params
    const { startTime, endTime } = req.body
    if (!startTime || !endTime) {
        return res.status(400).json({ message: 'startTime and endTime are required' })
    }
    const request = await SHIFT_REQUEST.findById(id)
    if (!request) return res.status(404).json({ message: 'Shift request not found' })
    if (request.status !== 'pending') {
        return res.status(409).json({ message: 'Can only propose times for a pending request' })
    }
    request.proposedStartTime = startTime.trim()
    request.proposedEndTime   = endTime.trim()
    request.status = 'proposed'
    await request.save()

    try {
        const io = require('../utils/socket').getIO()
        io.to(`staff_${request.staffMember}`).emit('shift_proposal_received', {
            _id: request._id,
            requestedDate: request.requestedDate,
            proposedStartTime: request.proposedStartTime,
            proposedEndTime: request.proposedEndTime,
            notes: request.notes,
            status: request.status
        })
    } catch { /* socket may not be initialised in test environments */ }

    // Push notification to the staff member — manager proposed a shift time for their request
    try {
        const staffMember = await STAFF.findById(request.staffMember).select('pushSubscription')
        sendPush(staffMember?.pushSubscription, {
            title: 'Shift Time Proposed',
            body: `Your manager has proposed a shift time for ${request.requestedDate}: ${startTime} – ${endTime}. Check your dashboard to respond.`,
            icon: '/favicon.ico',
            tag: `proposal-${request._id}`
        })
    } catch { /* non-critical */ }

    return res.status(200).json({ message: 'Time proposal sent to staff member for review' })
})

// Confirms or denies a shift request at the final manager step.
// 'confirm' only works on staff_agreed requests (staff has already accepted the proposal).
// 'deny' works on any unresolved status so the manager can reject at any stage.
exports.resolveShiftRequest = asyncHandler(async (req, res) => {
    const { id } = req.params
    const { action } = req.body
    if (!['confirm', 'deny'].includes(action)) {
        return res.status(400).json({ message: 'action must be confirm or deny' })
    }
    const request = await SHIFT_REQUEST.findById(id)
    if (!request) return res.status(404).json({ message: 'Shift request not found' })
    if (['approved', 'denied'].includes(request.status)) {
        return res.status(409).json({ message: 'Request has already been resolved' })
    }

    if (action === 'confirm') {
        // Only finalise once the staff member has agreed to the proposed times
        if (request.status !== 'staff_agreed') {
            return res.status(409).json({ message: 'Cannot confirm — staff has not yet agreed to the proposed times' })
        }
        request.status = 'approved'
        await request.save()

        // Create the roster shift using the times agreed in the proposal
        const newShift = new SHIFT({
            belongs_to: request.staffMember,
            date: request.requestedDate,
            shift_start_time: request.proposedStartTime,
            shift_end_time:   request.proposedEndTime,
            status: 'filled'
        })
        await newShift.save()

        // Mirror the confirmed shift in the staff member's Google Calendar
        const staffMember = await STAFF.findById(request.staffMember)
        if (staffMember) {
            const calEventId = await createShiftEvent(staffMember, newShift)
            if (calEventId) {
                newShift.googleCalendarEventId = calEventId
                await newShift.save()
            }
        }

        try {
            const io = require('../utils/socket').getIO()
            io.to(`staff_${request.staffMember}`).emit('shift_request_resolved', {
                requestId: request._id,
                status: 'approved',
                requestedDate: request.requestedDate
            })
        } catch { /* non-critical */ }

        // Push notification to the staff member — their request was approved
        try {
            const staffMember = await STAFF.findById(request.staffMember).select('pushSubscription')
            sendPush(staffMember?.pushSubscription, {
                title: 'Shift Request Approved',
                body: `Your shift request for ${request.requestedDate} has been approved and added to your roster.`,
                icon: '/favicon.ico',
                tag: `request-approved-${request._id}`
            })
        } catch { /* non-critical */ }

        return res.status(200).json({ message: 'Shift confirmed and added to roster' })
    }

    // Deny path — update status only, no shift is created
    request.status = 'denied'
    await request.save()

    try {
        const io = require('../utils/socket').getIO()
        io.to(`staff_${request.staffMember}`).emit('shift_request_resolved', {
            requestId: request._id,
            status: 'denied',
            requestedDate: request.requestedDate
        })
    } catch { /* non-critical */ }

    // Push notification to the staff member — their request was denied
    try {
        const staffMember = await STAFF.findById(request.staffMember).select('pushSubscription')
        sendPush(staffMember?.pushSubscription, {
            title: 'Shift Request Denied',
            body: `Your shift request for ${request.requestedDate} was not approved. Contact your manager for details.`,
            icon: '/favicon.ico',
            tag: `request-denied-${request._id}`
        })
    } catch { /* non-critical */ }

    return res.status(200).json({ message: 'Request denied' })
})
