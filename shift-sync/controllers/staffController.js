
const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const SHIFT = require("../models/shift")
const TOKEN = require("../models/tokenSign")
const bcrypt = require('bcryptjs')
const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')
const passport = require('passport')
const { initiateSwap, emailReviewToManager, staffAConfirmationMail, staffBConfirmationMail } = require('../utils/mailHtmls')
const { swapInitiate, staffConfirmationEmail, swapForwardToManagerEmail } = require('./sendMails')
const { runVelocityChecks, detectZeroVariance } = require('../services/gpsService')
const { verifyFace, isValidDescriptor } = require('../services/faceService')
const mlService = require('../services/mlService')
const clockIn = require('../models/clockIn')
const clockOut = require('../models/clockOut')

const google = require('passport-google-oauth20').Strategy;

exports.checkAuthentication = asyncHandler(async(req, res)=>{
    const {id} = req.params
    const tokenData = await TOKEN.findById(id)

    if(tokenData){
        jwt.verify(tokenData.token, process.env.JWT_INVITE_SECRET, (err, user)=>{
            if(err) return res.status(401).json({message : "You are unauthorized/restricted to view this site", err : err})
            res.redirect(`${process.env.BASE_URL}/api/create-staff-acc/${id}`)
        })
    }
})

exports.simulatingUIForAccCreation = asyncHandler(async (req, res)=>{
    res.send("We are connected and redirected successfully")
})

exports.creatingStaffAccount = asyncHandler(async (req, res, next)=>{
    const {id} = req.params
    const tokenData = await TOKEN.findById(id)
    if(tokenData){
        try{
            console.log("create account called")
            const payload = jwt.verify(tokenData.token, process.env.JWT_INVITE_SECRET)
            console.log("payload created", payload)
            return passport.authenticate('google', {
                scope : ['email', 'profile'],
                state : id
            })(req, res, next)
        }catch(err){    
            return res.status(401).json({
                message : "You are unauthorized",
                reason : err.name
            })
        }
    }
})

exports.getListOfAllStaffMembers = asyncHandler(async (req, res)=>{
    try{
        const staffMembers = await STAFF.find()
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

exports.initiateSwap = asyncHandler(async (req, res)=>{
    try{
        const { date, shift_start_time, shift_end_time, shift_length, swap_date, swap_belongs_to, swap_shift_start_time, swap_shift_end_time, swap_shift_length } = req.body
        const belongs_to = await STAFF.findById(req.user.id)
        const swapStaff = await STAFF.findById(swap_belongs_to)

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
                messageId : inviteResponse.messageId
            })
         }

    }catch(err){
        res.status(400).json({
            message : "Failed to send the mail, plase try agian later",
            err : err
        })
    }
})

exports.staffBAccepts = asyncHandler(async (req, res)=>{
    const {id} = req.params
    try{
        const shiftDetails = await SHIFT.findById(id)
        const staffB = await STAFF.findById(shiftDetails.swap_belongs_to)
        const staffA = await STAFF.findById(shiftDetails.belongs_to)
        const managers = await MANAGER.find()
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
        if(staffB.id === req.user.id){
            const staffBBodyHTML = staffBConfirmationMail(data)
            const staffABodyHTML = staffAConfirmationMail(data)
            const managerMailBodyHTML = emailReviewToManager(data)

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

exports.staffClockIn = asyncHandler(async (req, res)=>{
    try{
        const body = req.body
        const gpsCoordinates = Array.isArray(body.gpsCoordinates) ? body.gpsCoordinates : []

        // --- GPS velocity check (pure math, synchronous) ---
        const { isDriveByPunch, maxVelocityMph } = runVelocityChecks(gpsCoordinates)
        const isSpoofedGPS = detectZeroVariance(gpsCoordinates)

        // --- Face verification (synchronous, purely math) ---
        const incomingDescriptor = Array.isArray(body.faceDescriptor) ? body.faceDescriptor : null
        const staffRecord = await STAFF.findById(req.user.id).select('faceDescriptor')
        const hasStoredDescriptor = staffRecord?.faceDescriptor?.length === 128

        let faceVerification = { registered: hasStoredDescriptor, isVerified: null, distance: null }
        if (hasStoredDescriptor && incomingDescriptor && isValidDescriptor(incomingDescriptor)) {
            const result = verifyFace(staffRecord.faceDescriptor, incomingDescriptor)
            faceVerification.isVerified = result.isVerified
            faceVerification.distance = result.distance
        }

        const dataEntry = new clockIn({
            staffMember : req.user.id,
            startOfShift : body.startOfShift,
            endOfShift : body.endOfShift,
            timeClockedIn : body.timeClockedIn,
            dateClockedIn : body.dateClockedIn,
            isLate : body.isLate,
            gpsCoordinates : gpsCoordinates,
            gpsFlags : {
                isDriveByPunch : isDriveByPunch,
                isSpoofedGPS : isSpoofedGPS,
                velocityMph : maxVelocityMph
            },
            faceVerification
        })
        await dataEntry.save()

        const newClockOut = new clockOut({
            staffMember : req.user.id,
            clockInRecord : dataEntry._id,
            startOfShift : body.startOfShift,
            endOfShift : body.endOfShift
        })
        await newClockOut.save()

        await STAFF.findByIdAndUpdate(req.user.id, {$push : {clock_In_Details : dataEntry._id}}, {new : true})

        // --- Respond immediately — GPS flag and ML check run in background ---
        const response = { msg : "Your Clock-in has been accepted" }
        if(isDriveByPunch || isSpoofedGPS) response.gpsWarning = true
        res.status(200).json(response)

        // --- Notify managers if flagged (non-blocking) ---
        if(isDriveByPunch || isSpoofedGPS){
            const staffMember = await STAFF.findById(req.user.id).select('staffName')
            const managers = await MANAGER.find().select('email first_name')
            const alertData = {
                staffName : staffMember.staffName,
                managerName : managers[0]?.first_name || 'Manager',
                dateClockedIn : body.dateClockedIn,
                timeClockedIn : body.timeClockedIn,
                isDriveByPunch,
                isSpoofedGPS,
                velocityMph : maxVelocityMph
            }

            try {
                const io = require('../utils/socket').getIO();
                io.emit('gps_warning', alertData);
            } catch (socketErr) {
                console.error("Socket error on gps_warning emit:", socketErr);
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

exports.registerFace = asyncHandler(async (req, res)=>{
    const { faceDescriptor } = req.body
    if (!isValidDescriptor(faceDescriptor)) {
        return res.status(400).json({ message : 'faceDescriptor must be an array of exactly 128 finite numbers.' })
    }
    await STAFF.findByIdAndUpdate(req.user.id, { faceDescriptor })
    return res.status(200).json({ message : 'Face registered successfully.' })
})

exports.staffClockOut = asyncHandler(async (req, res)=>{
    try{
        const someData = req.body
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
