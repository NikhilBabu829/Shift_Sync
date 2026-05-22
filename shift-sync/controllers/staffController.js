
// Mongoose models used across staff operations
const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const SHIFT = require("../models/shift")
const SHIFT_REQUEST = require('../models/shiftRequest')
const TOKEN = require("../models/tokenSign")
const bcrypt = require('bcryptjs')
// Wraps async route handlers and forwards thrown errors to Express error handler
const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')
const passport = require('passport')
// HTML template builders for swap-related emails
const { initiateSwap, emailReviewToManager, staffAConfirmationMail, staffBConfirmationMail } = require('../utils/mailHtmls')
// Mail-sending helpers for swap workflow
const { swapInitiate, staffConfirmationEmail, swapForwardToManagerEmail, notifyManagerGpsFlag, notifyManagerFaceMismatch, swapDeclineNotifyStaffA } = require('./sendMails')
// GPS fraud detection utilities (pure math, no I/O)
const { runVelocityChecks, detectZeroVariance } = require('../services/gpsService')
const { sendPushToMany } = require('../utils/webPush')
// Google Calendar sync used when transferring shift ownership on a claim
const { createShiftEvent, deleteShiftEvent } = require('../services/googleCalendarService')
// Face descriptor verification utilities (pure math, no I/O)
const { verifyFace, isValidDescriptor } = require('../services/faceService')
// ML microservice client for GPS anomaly scoring
const mlService = require('../services/mlService')
// Clock-in and clock-out models (lowercase imports used intentionally)
const clockIn = require('../models/clockIn')
const clockOut = require('../models/clockOut')

// Validates an invite token by id; redirects to account creation if valid
exports.checkAuthentication = asyncHandler(async(req, res)=>{
    const {id} = req.params
    const tokenData = await TOKEN.findById(id)

    if(tokenData){
        jwt.verify(tokenData.token, process.env.JWT_INVITE_SECRET, (err, user)=>{
            if(err) return res.status(401).json({message : "You are unauthorized/restricted to view this site", err : err})
            // Token is valid — redirect to the account creation handler
            res.redirect(`${process.env.BASE_URL}/api/create-staff-acc/${id}`)
        })
    }
})

// Validates the invite token and triggers the Google OAuth flow, passing the token id as state
exports.creatingStaffAccount = asyncHandler(async (req, res, next)=>{
    const {id} = req.params
    const tokenData = await TOKEN.findById(id)
    if(tokenData){
        try{
            // Verify the invite token hasn't expired before starting OAuth
            const payload = jwt.verify(tokenData.token, process.env.JWT_INVITE_SECRET)
            return passport.authenticate('google', {
                scope : ['email', 'profile', 'https://www.googleapis.com/auth/calendar'],
                accessType : 'offline',
                prompt : 'consent',
                state : id  // pass token id through OAuth state so the callback can retrieve it
            })(req, res, next)
        }catch(err){
            return res.status(401).json({
                message : "Your invite link has expired or is invalid.",
                reason : err.name
            })
        }
    }else{
        return res.status(404).json({
            message : "Invite not found. This link may have already been used or has expired."
        })
    }
})

// Returns all staff members and the requesting user's own document
exports.getListOfAllStaffMembers = asyncHandler(async (req, res)=>{
    try{
        const staffMembers = await STAFF.find()
        // Fetch the requesting user separately to confirm they exist in the DB
        const user = await STAFF.findById(req.user.id)
        res.status(200).json({
            staffMembers : staffMembers,
            user : user
        })
    }catch(err){
        res.status(401).json({
            message : "You are unauthorized",
            error : err
        })
    }
})

/**
 *
 *     const allManagers = await MANAGER.find()
 *     const randomManager = Math.random().toFixed(0) * (allManagers.length - 1)
 *
 */

// Creates a pending swap shift record and emails Staff B to accept or reject the request
exports.initiateSwap = asyncHandler(async (req, res)=>{
    try{
        const { date, shift_start_time, shift_end_time, shift_length, swapDate, swap_belongs_to, swap_shift_start_time, swap_shift_end_time, swap_shift_length } = req.body
        // Resolve Staff A from the authenticated user id
        const belongs_to = await STAFF.findById(req.user.id)
        const swapStaff = await STAFF.findById(swap_belongs_to)

        // Persist the proposed swap so it can be referenced by the acceptance link
        const shiftData = new SHIFT({
            date : date,
            belongs_to : belongs_to._id,
            shift_start_time : shift_start_time,
            shift_end_time : shift_end_time,
            swapDate : swapDate,
            swap_belongs_to : swapStaff._id,
            swap_shift_start_time : swap_shift_start_time,
            swap_shift_end_time : swap_shift_end_time
        })
        await shiftData.save()

        // Notify staff B in real time so the swap request appears in their notification bell immediately
        try {
            const io = require('../utils/socket').getIO()
            io.to(`staff_${swapStaff._id}`).emit('swap_request_received', {
                shiftId: shiftData._id,
                requesterName: belongs_to.staffName,
                date,
                shift_start_time,
                shift_end_time,
                swapDate,
                swap_shift_start_time,
                swap_shift_end_time
            })
        } catch(err) { console.error('[initiateSwap] Socket notify staff B failed:', err.message) }

        // Build the email body HTML containing the swap summary and acceptance link
        const bodyHTML = initiateSwap({date, shift_start_time, shift_end_time, belongs_to, swapDate, swap_shift_start_time, swap_shift_end_time, swapStaff, id : shiftData.id})

        const swapInitiateResponse = await swapInitiate({to : swapStaff.email, belongsToStaffName : belongs_to.staffName, date : date, shift_start_time : shift_start_time, shift_end_time : shift_end_time, bodyHTML : bodyHTML})

        if(swapInitiateResponse.accepted && swapInitiateResponse.accepted.length > 0){
            return res.status(200).json({

                message : `Mail sent successfully to ${swapStaff.email}`,
                messageId : swapInitiateResponse.messageId
            })
        }else{
            return res.status(400).json({
                message : "Mail was not accepted by the server please try again later",
                messageId : swapInitiateResponse.messageId
            })
         }

    }catch(err){
        res.status(400).json({
            message : "Failed to send the mail, plase try agian later",
            err : err
        })
    }
})

// Staff B accepts the swap — sends confirmation emails to both parties and forwards to a random manager
exports.staffBAccepts = asyncHandler(async (req, res)=>{
    const {id} = req.params
    // Formats a stored date (YYYY-MM-DD string or Date object) as a readable string
    // using local time so YYYY-MM-DD values never shift a day in non-UTC timezones
    const toDisplayDate = (v) => {
        if (!v) return ''
        if (v instanceof Date) return v.toDateString()
        const s = String(v)
        const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
        return isNaN(d) ? s : d.toDateString()
    }
    try{
        const [shiftDetails, managers] = await Promise.all([
            SHIFT.findById(id),
            MANAGER.find().select('email first_name pushSubscriptions').lean()
        ])
        const [staffB, staffA] = await Promise.all([
            STAFF.findById(shiftDetails.swap_belongs_to),
            STAFF.findById(shiftDetails.belongs_to)
        ])
        // Pick a manager at random to handle the approval; avoids assigning to a specific manager
        const randomManager = Math.floor(Math.random() * managers.length)
        const data = {
            id : shiftDetails.id,
            date : toDisplayDate(shiftDetails.date),
            belongs_to : staffA.staffName,
            shift_start_time : shiftDetails.shift_start_time,
            shift_end_time : shiftDetails.shift_end_time,
            swapDate : toDisplayDate(shiftDetails.swapDate),
            swap_belongs_to : staffB.staffName,
            swap_shift_start_time : shiftDetails.swap_shift_start_time,
            swap_shift_end_time : shiftDetails.swap_shift_end_time,
            manager : managers[randomManager].first_name
        }
        // Guard: only Staff B (the swap target) can accept
        if(staffB.id === req.user.id){
            // Build personalised HTML email bodies for each recipient
            const staffBBodyHTML = staffBConfirmationMail(data)
            const staffABodyHTML = staffAConfirmationMail(data)
            const managerMailBodyHTML = emailReviewToManager(data)

            // Chain the three emails: B → A → Manager (each only sent if the previous succeeds)
            const staffBConfirmation = await staffConfirmationEmail({to : staffB.email, bodyHTML : staffBBodyHTML, id : data.id})
            if(staffBConfirmation.accepted && staffBConfirmation.accepted.length > 0){
                const staffAConfirmation = await staffConfirmationEmail({to : staffA.email, bodyHTML : staffABodyHTML, id : data.id})
                  if(staffAConfirmation.accepted && staffAConfirmation.accepted.length > 0){
                    const swapForwardToManager = await swapForwardToManagerEmail({to : managers[randomManager].email, bodyHTML : managerMailBodyHTML, belongs_to : data.belongs_to, swap_belongs_to : data.swap_belongs_to})
                    if(swapForwardToManager.accepted && swapForwardToManager.accepted.length > 0){
                        // Push notification to all managers — a swap is waiting for their approval (reuse the already-fetched managers list)
                        const allSubs = managers.flatMap(m => m.pushSubscriptions || [])
                        sendPushToMany(allSubs, {
                            title: 'Shift Swap Pending Approval',
                            body: `${data.belongs_to} and ${data.swap_belongs_to} have agreed to swap shifts — review it in the dashboard.`,
                            icon: '/favicon.ico',
                            tag: `swap-${data.id}`
                        })

                        // Real-time in-app notification to all managers via Socket.io
                        try {
                            const io = require('../utils/socket').getIO()
                            io.to('managers').emit('swap_pending_approval', {
                                staffAName: data.belongs_to,
                                staffBName: data.swap_belongs_to,
                                date: data.date,
                                swapDate: data.swapDate
                            })
                        } catch { /* socket may not be initialised in test environments */ }

                        res.status(200).json({
                            message : "Your Response has now been sent to the manager, please check you email for confirmation of the forward"
                        })
                    }else{
                        res.status(400).json({
                            message : "Something went wrong while forwarding the email, please try again!"
                        })
                    }
                }else{
                    res.status(400).json({
                        message : "Something went wrong while forwarding the email, please try again!"
                    })
                }
            }else{
                res.status(400).json({
                    message : "Something went wrong while forwarding the email, please try again!"
                })
            }
        }else{
            return res.status(401).json({
                message : "You are unauthorised"
            })
        }
    }catch(err){
        console.log(err)
        return res.status(400).json({
            message : "Something went wrong please try again!",
        })
    }
})

// Staff B declines a pending swap request — deletes the shift record and emails Staff A
exports.staffBDeclines = asyncHandler(async (req, res) => {
    const { id } = req.params
    const toDisplayDate = (v) => {
        if (!v) return ''
        const s = String(v)
        const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
        return isNaN(d) ? s : d.toDateString()
    }
    try {
        const shiftDetails = await SHIFT.findById(id)
        if (!shiftDetails) return res.status(404).json({ message: 'Swap request not found or already resolved.' })

        const [staffB, staffA] = await Promise.all([
            STAFF.findById(shiftDetails.swap_belongs_to),
            STAFF.findById(shiftDetails.belongs_to)
        ])

        if (!staffB || staffB.id !== req.user.id) {
            return res.status(401).json({ message: 'You are not authorised to decline this swap.' })
        }

        // Delete the pending swap record so it disappears from the manager's queue
        await SHIFT.findByIdAndDelete(id)

        // Notify Staff A by email (best-effort — don't block the response on mail failure)
        swapDeclineNotifyStaffA({
            staffAEmail: staffA.email,
            staffAName: staffA.staffName,
            staffBName: staffB.staffName,
            date: toDisplayDate(shiftDetails.date),
            shift_start_time: shiftDetails.shift_start_time,
            shift_end_time: shiftDetails.shift_end_time,
            swapDate: toDisplayDate(shiftDetails.swapDate),
            swap_shift_start_time: shiftDetails.swap_shift_start_time,
            swap_shift_end_time: shiftDetails.swap_shift_end_time
        })

        // Real-time notification to Staff A if they're online
        try {
            const io = require('../utils/socket').getIO()
            io.to(`staff_${staffA.id}`).emit('swap_declined', {
                staffBName: staffB.staffName,
                date: toDisplayDate(shiftDetails.date)
            })
        } catch { /* non-critical */ }

        return res.status(200).json({ message: 'Swap request declined. The requester has been notified.' })
    } catch (err) {
        console.log(err)
        return res.status(500).json({ message: 'Something went wrong. Please try again.' })
    }
})

// Records a staff clock-in with GPS and face verification; enforces roster, dedup, and early-window rules
exports.staffClockIn = asyncHandler(async (req, res)=>{
    try{
        const body = req.body

        // --- Roster enforcement: must have a roster shift assigned for today ---
        const todayISO = new Date().toISOString().split('T')[0]
        const assignedShift = await SHIFT.findOne({
            belongs_to : req.user.id,
            date : todayISO,
            status : 'filled'
        })
        if (!assignedShift) {
            return res.status(403).json({ message : 'You have no shift scheduled for today.' })
        }

        // --- Single clock-in per day ---
        const serverToday = new Date().toDateString()
        const alreadyClockedIn = await clockIn.findOne({ staffMember : req.user.id, dateClockedIn : serverToday })
        if (alreadyClockedIn) {
            return res.status(403).json({ message : 'You have already clocked in today.' })
        }

        // --- 30-minute early window ---
        const [startH, startM] = assignedShift.shift_start_time.split(':').map(Number)
        const shiftStartMs = new Date()
        shiftStartMs.setHours(startH, startM, 0, 0)
        // Calculate the earliest allowed clock-in time
        const openAt = new Date(shiftStartMs.getTime() - 30 * 60 * 1000)
        if (new Date() < openAt) {
            const minutesLeft = Math.ceil((openAt - Date.now()) / 60000)
            return res.status(403).json({ message : `Clock-in opens 30 minutes before your shift. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` })
        }

        // Normalise GPS payload — default to empty array if not provided
        const gpsCoordinates = Array.isArray(body.gpsCoordinates) ? body.gpsCoordinates : []

        // --- GPS velocity check (pure math, synchronous) ---
        const { isDriveByPunch, maxVelocityMph } = runVelocityChecks(gpsCoordinates)
        // Zero-variance GPS means all coordinates are identical — likely a fake/spoofed location
        const isSpoofedGPS = detectZeroVariance(gpsCoordinates)

        // --- Face verification (synchronous, purely math) ---
        const incomingDescriptor = Array.isArray(body.faceDescriptor) ? body.faceDescriptor : null
        // Fetch only the faceDescriptor field to minimise data transfer
        const staffRecord = await STAFF.findById(req.user.id).select('faceDescriptor')
        const hasStoredDescriptor = staffRecord?.faceDescriptor?.length === 128

        // Build the initial verification result object; isVerified = null if not attempted
        let faceVerification = { registered: hasStoredDescriptor, isVerified: null, distance: null }
        if (hasStoredDescriptor && incomingDescriptor && isValidDescriptor(incomingDescriptor)) {
            const result = verifyFace(staffRecord.faceDescriptor, incomingDescriptor)
            faceVerification.isVerified = result.isVerified
            faceVerification.distance = result.distance
        }

        const now = new Date()
        // Mark as late if the current time is past the scheduled shift start
        const isLate = now > shiftStartMs

        // Persist the clock-in record including all fraud-detection flags
        const dataEntry = new clockIn({
            staffMember : req.user.id,
            startOfShift : assignedShift.shift_start_time,
            endOfShift : assignedShift.shift_end_time,
            timeClockedIn : now.toLocaleTimeString(),
            dateClockedIn : serverToday,
            isLate,
            gpsCoordinates : gpsCoordinates,
            gpsFlags : {
                isDriveByPunch : isDriveByPunch,
                isSpoofedGPS : isSpoofedGPS,
                velocityMph : maxVelocityMph
            },
            faceVerification
        })
        await dataEntry.save()

        // Create a matching open clock-out record so clock-out can find it later
        const newClockOut = new clockOut({
            staffMember : req.user.id,
            clockInRecord : dataEntry._id,
            startOfShift : assignedShift.shift_start_time,
            endOfShift : assignedShift.shift_end_time
        })
        await newClockOut.save()

        // Add the clock-in id to the staff member's history array
        await STAFF.findByIdAndUpdate(req.user.id, {$push : {clock_In_Details : dataEntry._id}}, {new : true})

        // --- Respond immediately — GPS flag and ML check run in background ---
        const response = { msg : "Your Clock-in has been accepted", faceVerification }
        if(isDriveByPunch || isSpoofedGPS) response.gpsWarning = true
        res.status(200).json(response)

        // --- Broadcast clock-in to manager dashboard in real time ---
        try {
            const clockedInStaff = await STAFF.findById(req.user.id).select('staffName role department')
            const io = require('../utils/socket').getIO()
            io.to('managers').emit('staff_clocked_in', {
                _id           : dataEntry._id,
                name          : clockedInStaff?.staffName || 'Staff',
                role          : clockedInStaff?.role || '',
                dept          : clockedInStaff?.department || '',
                shift         : `${assignedShift.shift_start_time} – ${assignedShift.shift_end_time}`,
                status        : isLate ? 'LATE IN' : 'ON TIME',
                timeClockedIn : dataEntry.timeClockedIn,
                timeClockedOut: null,
            })
        } catch { /* socket unavailable — manager dashboard will show on next refresh */ }

        // --- Notify managers if flagged (non-blocking, runs after response) ---
        if(isDriveByPunch || isSpoofedGPS || faceVerification.isVerified === false){
            const staffMember = await STAFF.findById(req.user.id).select('staffName')
            const managers = await MANAGER.find().select('email first_name')

            if(isDriveByPunch || isSpoofedGPS){
                const gpsAlertData = {
                    staffName     : staffMember.staffName,
                    managerName   : managers[0]?.first_name || 'Manager',
                    dateClockedIn : serverToday,
                    timeClockedIn : now.toLocaleTimeString(),
                    isDriveByPunch,
                    isSpoofedGPS,
                    velocityMph   : maxVelocityMph
                }
                // Broadcast the GPS warning to all connected dashboard clients via socket
                try {
                    const io = require('../utils/socket').getIO()
                    io.emit('gps_warning', gpsAlertData)
                } catch (socketErr) {
                    console.error('Socket error on gps_warning emit:', socketErr)
                }
                // Email every manager about the suspicious clock-in
                for(const manager of managers){
                    notifyManagerGpsFlag(manager.email, { ...gpsAlertData, managerName: manager.first_name || 'Manager' })
                }
            }

            if(faceVerification.isVerified === false){
                const faceMismatchData = {
                    staffName     : staffMember.staffName,
                    dateClockedIn : serverToday,
                    timeClockedIn : now.toLocaleTimeString(),
                    startOfShift  : assignedShift.shift_start_time,
                    endOfShift    : assignedShift.shift_end_time,
                    distance      : faceVerification.distance,
                    threshold     : 0.4
                }
                // Alert each manager by email about the face mismatch
                for(const manager of managers){
                    notifyManagerFaceMismatch(manager.email, { ...faceMismatchData, managerName: manager.first_name || 'Manager' })
                }
            }
        }

        // --- ML anomaly check (async, updates record after the fact) ---
        if(gpsCoordinates.length >= 2){
            mlService.checkGPSAnomaly({
                staffId : req.user.id,
                gpsCoordinates,
                clockInId : dataEntry._id.toString()
            }).then(async (result) => {
                if(result && result.isolationScore != null){
                    // Store the ML isolation score on the clock-in record for later review
                    await clockIn.findByIdAndUpdate(dataEntry._id, {
                        'gpsFlags.isolationScore' : result.isolationScore
                    })
                }
            }).catch(() => { /* ML service unavailable — fail open */ })
        }

    }catch(err){
        console.log(err)
        return res.status(400).json(err)
    }
})

// Stores a 128-dimensional face descriptor on the staff member's document for future verification
exports.registerFace = asyncHandler(async (req, res)=>{
    const { faceDescriptor } = req.body
    // Reject descriptors that don't conform to face-api.js output shape
    if (!isValidDescriptor(faceDescriptor)) {
        return res.status(400).json({ message : 'faceDescriptor must be an array of exactly 128 finite numbers.' })
    }
    await STAFF.findByIdAndUpdate(req.user.id, { faceDescriptor })
    return res.status(200).json({ message : 'Face registered successfully.' })
})

// Closes the open clock-out record by filling in the clock-out time and date
exports.staffClockOut = asyncHandler(async (req, res)=>{
    try{
        const someData = req.body
        // Find the most recent open (no timeClockedOut) clock-out record for this staff member
        const updated = await clockOut.findOneAndUpdate(
            { staffMember : req.user.id, timeClockedOut : { $exists : false } },
            {
                timeClockedOut : someData.timeClockedOut,
                dateClockedOut : someData.dateClockedOut,
                isLate : someData.isLate
            },
            { new : true }
        )
        if(!updated){
            return res.status(404).json({ msg : "No open clock-in found to clock out from" })
        }
        // Add the clock-out id to the staff member's history array
        await STAFF.findByIdAndUpdate(req.user.id, {$push : {clockOutDetails : updated._id}}, {new : true})
        return res.status(200).json({
            msg : "Your Clock-out has been accepted"
        })
    }
    catch(err){
        console.log(err)
        return res.status(400).json(err)
    }
})

// Returns all shift proposals sent to the authenticated staff member by the manager (status: 'proposed').
// Shown in the staff dashboard so the staff member can accept or decline.
exports.getMyShiftProposals = asyncHandler(async (req, res) => {
    const proposals = await SHIFT_REQUEST.find({ staffMember: req.user.id, status: 'proposed' })
        .sort({ createdAt: -1 })
        .lean()
    return res.status(200).json({ proposals })
})

// Staff member responds to a manager's proposed shift time.
// 'accept' moves the request to 'staff_agreed' (manager still needs to confirm to finalise the roster).
// 'deny'   moves it to 'denied' so the manager knows the proposal was rejected.
exports.respondToShiftProposal = asyncHandler(async (req, res) => {
    const { id } = req.params
    const { action } = req.body
    if (!['accept', 'deny'].includes(action)) {
        return res.status(400).json({ message: 'action must be accept or deny' })
    }
    const request = await SHIFT_REQUEST.findById(id)
    if (!request) return res.status(404).json({ message: 'Proposal not found' })
    // Only the staff member who submitted the original request may respond
    if (String(request.staffMember) !== String(req.user.id)) {
        return res.status(403).json({ message: 'This proposal does not belong to you' })
    }
    if (request.status !== 'proposed') {
        return res.status(409).json({ message: 'This proposal has already been responded to' })
    }
    request.status = action === 'accept' ? 'staff_agreed' : 'denied'
    await request.save()

    if (action === 'accept') {
        try {
            const io = require('../utils/socket').getIO()
            const populated = await SHIFT_REQUEST.findById(request._id)
                .populate('staffMember', 'staffName email role department')
                .lean()
            io.to('managers').emit('shift_proposal_responded', populated)
        } catch { /* non-critical */ }
    }

    return res.status(200).json({
        message: action === 'accept'
            ? 'Shift accepted — your manager will confirm shortly'
            : 'Shift proposal declined'
    })
})

// Staff member claims an open-cover shift from the Marketplace.
// Validates no double-booking, transfers ownership, syncs Google Calendar, and notifies managers.
exports.claimOpenShift = asyncHandler(async (req, res) => {
    const { id } = req.params
    const staffId = req.user.id

    const shift = await SHIFT.findById(id)
    if (!shift) return res.status(404).json({ message: 'Shift not found.' })
    if (shift.status !== 'open_cover') {
        return res.status(409).json({ message: 'This shift has already been claimed or is no longer available.' })
    }

    // Can't reclaim your own dropped shift
    if (String(shift.belongs_to) === String(staffId)) {
        return res.status(409).json({ message: "You can't claim your own shift." })
    }

    // Prevent double-booking on the same date
    const existing = await SHIFT.findOne({ belongs_to: staffId, date: shift.date, status: 'filled' })
    if (existing) {
        return res.status(409).json({ message: `You already have a shift on ${shift.date}.` })
    }

    // Remove the original owner's Google Calendar event before reassigning
    if (shift.googleCalendarEventId) {
        const originalOwner = await STAFF.findById(shift.belongs_to)
        if (originalOwner) await deleteShiftEvent(originalOwner, shift.googleCalendarEventId).catch(() => {})
    }

    // Transfer ownership and reactivate the shift
    shift.belongs_to = staffId
    shift.status = 'filled'
    shift.googleCalendarEventId = null
    await shift.save()

    // Mirror the shift in the new owner's Google Calendar
    const claimer = await STAFF.findById(staffId)
    if (claimer?.googleAccessToken) {
        const calEventId = await createShiftEvent(claimer, shift)
        if (calEventId) {
            shift.googleCalendarEventId = calEventId
            await shift.save()
        }
    }

    // Real-time events — update manager dashboard and remove the card from all staff Marketplace lists
    try {
        const io = require('../utils/socket').getIO()
        io.to('managers').emit('shift_claimed', {
            shiftId: shift._id,
            date: shift.date,
            claimerName: claimer?.staffName || 'A staff member',
            shift_start_time: shift.shift_start_time,
            shift_end_time: shift.shift_end_time
        })
        // Broadcast to all connected clients so the card disappears from every open Marketplace view
        io.emit('marketplace_shift_taken', { shiftId: String(shift._id) })
    } catch { /* socket not initialised in test environments */ }

    // Push notification to all managers
    const managers = await MANAGER.find().select('pushSubscriptions').lean()
    const allSubs = managers.flatMap(m => m.pushSubscriptions || [])
    sendPushToMany(allSubs, {
        title: 'Open Shift Claimed',
        body: `${claimer?.staffName || 'A staff member'} claimed the open shift on ${shift.date} (${shift.shift_start_time}–${shift.shift_end_time}).`,
        icon: '/favicon.ico',
        tag: `claimed-${shift._id}`
    })

    return res.status(200).json({ message: 'Shift claimed successfully.' })
})
