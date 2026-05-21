
// Mongoose models used across staff operations
const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const SHIFT = require("../models/shift")
const TOKEN = require("../models/tokenSign")
const bcrypt = require('bcryptjs')
// Wraps async route handlers and forwards thrown errors to Express error handler
const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')
const passport = require('passport')
// HTML template builders for swap-related emails
const { initiateSwap, emailReviewToManager, staffAConfirmationMail, staffBConfirmationMail } = require('../utils/mailHtmls')
// Mail-sending helpers for swap workflow
const { swapInitiate, staffConfirmationEmail, swapForwardToManagerEmail, notifyManagerGpsFlag, notifyManagerFaceMismatch } = require('./sendMails')
// GPS fraud detection utilities (pure math, no I/O)
const { runVelocityChecks, detectZeroVariance } = require('../services/gpsService')
// Face descriptor verification utilities (pure math, no I/O)
const { verifyFace, isValidDescriptor } = require('../services/faceService')
// ML microservice client for GPS anomaly scoring
const mlService = require('../services/mlService')
// Clock-in and clock-out models (lowercase imports used intentionally)
const clockIn = require('../models/clockIn')
const clockOut = require('../models/clockOut')

const google = require('passport-google-oauth20').Strategy;

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

// Stub route used during development to confirm the redirect chain works
exports.simulatingUIForAccCreation = asyncHandler(async (req, res)=>{
    res.send("We are connected and redirected successfully")
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
        const { date, shift_start_time, shift_end_time, shift_length, swap_date, swap_belongs_to, swap_shift_start_time, swap_shift_end_time, swap_shift_length } = req.body
        // Resolve Staff A from the authenticated user id
        const belongs_to = await STAFF.findById(req.user.id)
        const swapStaff = await STAFF.findById(swap_belongs_to)

        // Persist the proposed swap so it can be referenced by the acceptance link
        const shiftData = new SHIFT({
            date : date,
            belongs_to : belongs_to._id,
            shift_start_time : shift_start_time,
            shift_end_time : shift_end_time,
            swapDate : swap_date,
            swap_belongs_to : swapStaff._id,
            swap_shift_start_time : swap_shift_start_time,
            swap_shift_end_time : swap_shift_end_time
        })
        await shiftData.save()

        // Build the email body HTML containing the swap summary and acceptance link
        const bodyHTML = initiateSwap({date, shift_start_time, shift_end_time, belongs_to, swap_date, swap_shift_start_time, swap_shift_end_time, swapStaff, id : shiftData.id})

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
    try{
        const shiftDetails = await SHIFT.findById(id)
        const staffB = await STAFF.findById(shiftDetails.swap_belongs_to)
        const staffA = await STAFF.findById(shiftDetails.belongs_to)
        const managers = await MANAGER.find()
        // Pick a manager at random to handle the approval; avoids assigning to a specific manager
        const randomManager = Math.floor(Math.random() * managers.length)
        const data = {
            id : shiftDetails.id,
            date : shiftDetails.date.toDateString(),
            belongs_to : staffA.staffName,
            shift_start_time : shiftDetails.shift_start_time,
            shift_end_time : shiftDetails.shift_end_time,
            swapDate : shiftDetails.swapDate.toDateString(),
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
