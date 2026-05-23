const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')

// Rate-limiter applied to AI chat routes — 5 messages per minute per IP
const chatRateLimit = rateLimit({
    windowMs : 60 * 1000,   // 1 minute window
    max : 5,               // 5 messages per minute
    standardHeaders : true,
    legacyHeaders : false,
    message : { message : 'AI assistant is busy, please try again in a moment.' }
})

// Mongoose models used directly in inline route handlers
const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const TOKEN = require("../models/tokenSign")
const CLCOKIN = require("../models/clockIn")
const CLOCKOUT = require("../models/clockOut")

// Manager controller exports
const { manager_sign_up, manager_invite, get_pending_invitations, revoke_invitation, resend_invitation, swapFinalApproval, download_attendance, denySwap, getManagerStaff, getRoster, addRosterShift, removeRosterShift, getTodayLedger, getWeeklyAttendance, getShiftStats, getOrgRoles, addOrgRole, removeOrgRole, getOrgDepartments, addOrgDepartment, removeOrgDepartment, getPendingShiftRequests, proposeShiftTime, resolveShiftRequest, getOrgLocations, addOrgLocation, removeOrgLocation, getPendingSwaps, updateManagerDepartments } = require('../controllers/managerController')
// Staff controller exports
const { checkAuthentication, creatingStaffAccount, getListOfAllStaffMembers, initiateSwap, staffBAccepts, staffBDeclines, staffClockIn, staffClockOut, registerFace, getMyShiftProposals, respondToShiftProposal, claimOpenShift } = require('../controllers/staffController')
// AI chat handlers for staff and manager
const { handleChat, handleManagerChat } = require('../controllers/aiController')
const SHIFT = require('../models/shift')
// Smart Match — finds best available staff to cover an open shift
const { findCoverCandidates } = require('../services/smartMatchService')
const passport = require('passport')
// Test mail helper
const {testMail} = require('../controllers/sendMails')
// Leave request handlers (staff submit + manager approve/deny/revoke/register)
const { submitLeaveRequest, getMyLeaveRequests, getPendingLeaveRequests, approveLeaveRequest, denyLeaveRequest, getAllLeaveRequests, revokeLeaveRequest } = require('../controllers/leaveController')
// Availability handlers (staff set/get + manager view)
const { setAvailability, getMyAvailability, removeAvailability, getStaffAvailability } = require('../controllers/availabilityController')

// Middleware: verifies a Bearer JWT in the Authorization header (used for manager routes)
function authMiddleWare(req, res, next){
    console.log("Entered middleware")
    const authHeader = req.headers['authorization']
    // Extract token from "Bearer <token>" format
    const token = authHeader && authHeader.split(" ")[1]
    console.log(authHeader)
    if(token == null) return res.sendStatus(401)
    jwt.verify(token, process.env.JWT_SECRET, (err, user)=>{
        if(err) return res.sendStatus(403)
        // Attach decoded user payload so downstream handlers can read req.user
        req.user = user
        next()
    })
}

// Middleware: verifies staff auth from cookie, Authorization header, or URL query param
async function staffAuthenticationWithCookies(req, res, next){
    let actualToken = '';
    const urlToken = req.query.token;           // token passed as ?token= query string
    const token = req.cookies?.auth;            // token stored in the auth cookie
    const authHeader = req.headers['authorization']
    const authToken = authHeader && authHeader.split(" ")[1]
    // Precedence: cookie → Authorization header → query param
    if(token != undefined && token.length > 0){actualToken = token}
    if(authToken != undefined && authToken.length > 0){actualToken = authToken}
    if(urlToken != undefined && urlToken.length > 0){actualToken = urlToken}
    if( actualToken.length == 0 ) return res.status(401).json({message : "Unauthorized"})
    try{
        // Two-layer JWT: outer token wraps the real login token for extra tamper protection
        const topLevelToken = jwt.verify(actualToken, process.env.ROOT_SECRET_PASS)
        const userTOken = jwt.verify(topLevelToken.loginToken, process.env.JWT_SECRET)
        req.user = userTOken
        next()
    }catch(err){
        return res.status(401).json({messsage : "Token Expired"})
    }
}

//manager routes

// Download attendance report as an Excel file — manager auth required
router.get("/download-attendance", authMiddleWare, download_attendance)

// Manager login — validates credentials via passport local strategy and returns a JWT
router.post("/manager-login", (req, res, next)=>{
    passport.authenticate("manager-local", {session : false}, (err, user, info)=>{
        if(err){
            return res.status(500).json({message : "Server error please try again"})
        }
        if(!user){
            return res.status(400).json({message : "please check the email and password, and try again!"})
        }
        // Issue a 24-hour JWT containing manager id and email
        const token = jwt.sign({id : user.id, email : user.email}, process.env.JWT_SECRET, {expiresIn : "24h"})
        return res.json({token, manager : user})
    })(req, res, next)
})

// Health-check endpoint — confirms the API router is mounted
router.get("/", (req, res, next)=>{
    res.send("connected")
})

// Register a new manager account and organisation
router.post("/manager-sign-up", manager_sign_up)

// Invite staff member(s) by email — sends invite link via email
router.post("/staff-add", authMiddleWare, manager_invite)

// List all pending (unused) invite tokens
router.get("/pending-invitations", authMiddleWare, get_pending_invitations)

// Delete an invite token by its DB id, preventing further use
router.delete("/revoke-invitation/:id", authMiddleWare, revoke_invitation)

// Re-send the invite email for an existing token
router.post("/resend-invitation/:id", authMiddleWare, resend_invitation)

// Send a test email to verify transporter configuration
router.post('/send-mail',authMiddleWare, testMail)

// Manager approves a pending swap — sends confirmation emails to both staff members
router.post("/swap-final-approval/:id", authMiddleWare, swapFinalApproval)

// Manager denies a pending swap — deletes the swap shift record
router.post("/deny-swap/:id", authMiddleWare, denySwap)

// Returns pending swaps for the authenticated manager (filtered by department if configured)
router.get("/pending-swaps", authMiddleWare, getPendingSwaps)

// Updates the list of departments this manager is responsible for
router.put("/manager-departments", authMiddleWare, updateManagerDepartments)

// Returns all staff members with basic profile fields (name, email, dept, role)
router.get("/manager-staff", authMiddleWare, getManagerStaff)

// Returns roster shifts optionally filtered by date range
router.get("/roster", authMiddleWare, getRoster)

// Adds a new filled shift to the roster
router.post("/roster", authMiddleWare, addRosterShift)

// Removes a specific roster shift by id
router.post("/roster/remove/:id", authMiddleWare, removeRosterShift)

// Returns today's attendance ledger with clock-in/out times and late/overtime flags
router.get("/today-ledger", authMiddleWare, getTodayLedger)

// Returns the last 7 days of attendance counts vs expected headcount
router.get("/weekly-attendance", authMiddleWare, getWeeklyAttendance)

// Returns how many staff are currently on-shift vs total headcount
router.get("/shift-stats", authMiddleWare, getShiftStats)

// CRUD for organisation-defined roles stored on the Manager document
router.get("/org-roles", authMiddleWare, getOrgRoles)
router.post("/org-roles", authMiddleWare, addOrgRole)
router.post("/org-roles/remove", authMiddleWare, removeOrgRole)

// CRUD for organisation-defined team/department types stored on the Manager document
router.get("/org-departments", authMiddleWare, getOrgDepartments)
router.post("/org-departments", authMiddleWare, addOrgDepartment)
router.post("/org-departments/remove", authMiddleWare, removeOrgDepartment)

// CRUD for organisation site locations — used for multi-site GPS geo-fencing
router.get("/org-locations", authMiddleWare, getOrgLocations)
router.post("/org-locations", authMiddleWare, addOrgLocation)
router.delete("/org-locations/:locationId", authMiddleWare, removeOrgLocation)

// Retrieve shift requests that need manager action (pending + staff_agreed)
router.get("/pending-shift-requests", authMiddleWare, getPendingShiftRequests)
// Manager sends a time proposal back to the staff member (moves request to 'proposed')
router.post("/shift-request-propose/:id", authMiddleWare, proposeShiftTime)
// Manager confirms a staff-agreed proposal or denies any unresolved request
router.post("/shift-request-resolve/:id", authMiddleWare, resolveShiftRequest)

// Staff views proposals sent to them by the manager
router.get("/my-shift-proposals", staffAuthenticationWithCookies, getMyShiftProposals)
// Staff accepts or denies a manager's time proposal
router.post("/shift-proposal-respond/:id", staffAuthenticationWithCookies, respondToShiftProposal)

// Staff submits a new leave request
router.post("/leave-request", staffAuthenticationWithCookies, submitLeaveRequest)
// Staff views their own leave request history
router.get("/my-leave-requests", staffAuthenticationWithCookies, getMyLeaveRequests)
// Manager retrieves all pending leave requests
router.get("/pending-leave-requests", authMiddleWare, getPendingLeaveRequests)
// Manager approves a leave request
router.post("/leave-request-approve/:id", authMiddleWare, approveLeaveRequest)
// Manager denies a leave request (body: { managerNotes? })
router.post("/leave-request-deny/:id", authMiddleWare, denyLeaveRequest)
// Manager retrieves all leave requests with optional filters (?from=&to=&status=&staffId=)
router.get("/all-leave-requests", authMiddleWare, getAllLeaveRequests)
// Manager revokes a previously approved leave (body: { managerNotes? })
router.post("/leave-request-revoke/:id", authMiddleWare, revokeLeaveRequest)

// Staff sets or updates a single availability entry (upsert)
router.post("/my-availability", staffAuthenticationWithCookies, setAvailability)
// Staff retrieves all their availability entries
router.get("/my-availability", staffAuthenticationWithCookies, getMyAvailability)
// Staff removes a specific availability entry
router.post("/my-availability/remove", staffAuthenticationWithCookies, removeAvailability)
// Manager views a specific staff member's availability schedule
router.get("/staff-availability/:id", authMiddleWare, getStaffAvailability)

// Returns the currently authenticated manager's full document
router.get("/manager-auth", authMiddleWare, async (req, res)=>{
    const manager = await MANAGER.findById(req.user.id)
    return res.status(200).json({user : manager})
})

//staff routes

// Returns the authenticated staff member's full document (used to restore session on page refresh)
router.get("/staff-auth", staffAuthenticationWithCookies, async (req, res)=>{
    const userDetails = await STAFF.findById(req.user.id)
    return res.status(200).json({message : "Good to go", user : userDetails})
})

// Returns a single staff member's public profile by MongoDB id (OAuth tokens excluded)
router.get("/see-staff/:id", staffAuthenticationWithCookies, async (req, res)=>{
    try{
        const staffMember = await STAFF.findById(req.params.id)
            .select('-googleAccessToken -googleRefreshToken -faceDescriptor')
            .lean()
        if(staffMember){
            return res.status(200).json({staff : staffMember})
        }else{
            return res.status(404).json({message : "Staff member not found"})
        }
    }catch(err){
        return res.status(500).json({message : "Server error"})
    }
})

// Returns all staff members plus the requesting user's own document
router.get("/staff",staffAuthenticationWithCookies ,getListOfAllStaffMembers)

// Validates the invite token before redirecting to account creation
router.get("/join/:id", checkAuthentication)

// Staff member initiates a shift swap request with another staff member
router.post("/initiate-swap", staffAuthenticationWithCookies, initiateSwap)

// Staff B confirms they accept the swap, forwarding it to manager for approval
router.get("/staffB-accepts/:id", staffAuthenticationWithCookies, staffBAccepts)

// Staff B declines the swap request — deletes the record and notifies Staff A
router.get("/staffB-declines/:id", staffAuthenticationWithCookies, staffBDeclines)

// Redirects a new staff member to Google OAuth after validating their invite token
router.get("/create-staff-acc/:id", creatingStaffAccount)

// Kicks off Google OAuth login flow for staff (redirects to Google consent screen)
// access_type:offline ensures a refresh token is issued so Calendar API calls can be made server-side
router.get("/staff-login", passport.authenticate("google", {
    scope : ['profile', 'email', 'https://www.googleapis.com/auth/calendar'],
    accessType : 'offline',
    prompt : 'consent'
}))

// Records a clock-in event with GPS and face verification data
router.post("/staff-clock-in", staffAuthenticationWithCookies, staffClockIn)

// Records a clock-out event, closing the matching open clock-in
router.post("/staff-clock-out", staffAuthenticationWithCookies, staffClockOut)

// Stores a staff member's 128-dimensional face descriptor for future verification
router.post("/register-face", staffAuthenticationWithCookies, registerFace)

// Google OAuth callback — links the Google profile to an existing Staff doc or creates one via invite
router.get("/redirectURI", passport.authenticate("google", {failureRedirect : process.env.FRONTEND_URL + "/staff-login"}),async (req, res, next)=>{
    try{
        const {user} = req;
        const staffAccount = await STAFF.findOne({google_id : user.id})
        const state = req.query.state
        if(staffAccount){
            // Returning user — refresh stored OAuth tokens then issue a nested JWT and redirect to the staff portal
            staffAccount.googleAccessToken = user._accessToken
            if(user._refreshToken) staffAccount.googleRefreshToken = user._refreshToken
            await staffAccount.save()
            const loginToken = jwt.sign({id : staffAccount.id, email : staffAccount.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
            const topLevelToken = jwt.sign({loginToken}, process.env.ROOT_SECRET_PASS, {expiresIn : '24h'})
            const tokenInURl = new URLSearchParams({
                token : topLevelToken
            })
            return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${tokenInURl}`)
        }else if(state != undefined){
            // New user arriving via an invite link — create their Staff document
            const managerToken = await TOKEN.findById(state)
            if(!managerToken){
                const msg = new URLSearchParams({ error : "Invite link has already been used or has expired." })
                return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${msg}`)
            }
            try{
                // Verify the invite token's outer and inner JWTs before creating the account
                const outerPayload = jwt.verify(managerToken.token, process.env.JWT_INVITE_SECRET)
                jwt.verify(outerPayload.signed, process.env.JWT_SECRET)   // validate inner token — throws if invalid
                const newUser = new STAFF({
                    google_id : user.id,
                    email : user.emails?.[0]?.value,
                    staffName : user.displayName,
                    profile_picture : user.photos?.[0]?.value,
                    role : managerToken.role || 'Staff Member',
                    department : managerToken.department || 'General',
                    googleAccessToken : user._accessToken,
                    googleRefreshToken : user._refreshToken || null
                })
                await newUser.save()
                // Build a session token for the new user and redirect to face enrollment
                const loginToken = jwt.sign({id : newUser.id, email : newUser.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
                const topLevelToken = jwt.sign({loginToken}, process.env.ROOT_SECRET_PASS, {expiresIn : '24h'})
                // Burn the invite token after successful use
                await TOKEN.findByIdAndDelete(state)
                const tokenInURL = new URLSearchParams({ token : topLevelToken })
                return res.redirect(`${process.env.FRONTEND_URL}/face-enroll?${tokenInURL}`)
            }catch(inviteErr){
                const msg = new URLSearchParams({ error : "Invite link is invalid or has expired. Ask your manager to resend." })
                return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${msg}`)
            }
        }
        else{
            // Google account not linked to any staff and no invite state — prompt for invite
            const msg = new URLSearchParams({
                error : "Invite Required",
                email : user.emails?.[0]?.value
            }).toString()
            return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${msg}`)
        }
    }catch(err){
        const msg = new URLSearchParams({
            error : err
        }).toString()
        return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${msg}`)
    }
})

// clockIn and clockOut routes

// Returns a single clock-in record by id (for reviewing past clock-ins)
router.get("/get-clockin/:id", staffAuthenticationWithCookies, async (req, res)=>{
    try{
        const clockInRecord = await CLCOKIN.findById(req.params.id)
        if(!clockInRecord){
            return res.status(404).json({message : "ClockIn record not found"})
        }
        return res.status(200).json({clockInRecord})
    }catch(err){
        return res.status(500).json({message : "Server error"})
    }
})

// Returns all clock-in records for a specific staff member
router.get("/view-all-clockins/:id", staffAuthenticationWithCookies, async (req, res)=>{
    try{
        const clockInRecordsOfStaff = await CLCOKIN.find({staffMember : req.params.id})
        return res.status(200).json(clockInRecordsOfStaff)
    }catch(err){
        return res.status(500).json({message : "Server error"})
    }
})

// Org config — returns HQ coordinates, locations array, org name, and roster type
router.get("/org-config", staffAuthenticationWithCookies, async (req, res) => {
    try {
        const manager = await MANAGER.findOne(
            { $or: [{ 'hq_coordinates.lat': { $ne: null } }, { 'locations.0': { $exists: true } }] },
            'org_name hq_coordinates locations rosterType'
        )
        if (!manager) return res.status(404).json({ message: "No organisation config found. Ask your manager to set HQ coordinates." })
        return res.status(200).json({
            org_name: manager.org_name,
            hq_coordinates: manager.hq_coordinates,
            locations: manager.locations || [],
            rosterType: manager.rosterType || 'weekly'
        })
    } catch (err) {
        return res.status(500).json({ message: "Server error" })
    }
})

// Full roster for the authenticated staff member filtered by optional date range
router.get("/my-roster", staffAuthenticationWithCookies, async (req, res) => {
    try {
        const { from, to } = req.query
        const filter = { belongs_to: req.user.id, status: { $in: ['filled', 'open_cover'] } }
        if (from || to) {
            filter.date = {}
            if (from) filter.date.$gte = from
            if (to) filter.date.$lte = to
        }
        const shifts = await SHIFT.find(filter).sort({ date: 1 }).lean()
        return res.status(200).json({ roster: shifts })
    } catch (err) {
        return res.status(500).json({ message: 'Server error' })
    }
})

// Today's roster shift for the authenticated staff member
router.get("/my-shift-today", staffAuthenticationWithCookies, async (req, res) => {
    try {
        const todayISO = new Date().toISOString().split('T')[0]
        const shift = await SHIFT.findOne({ belongs_to: req.user.id, date: todayISO, status: 'filled' }).lean()
        return res.status(200).json({ shift: shift || null })
    } catch (err) {
        return res.status(500).json({ message: "Server error" })
    }
})

// Returns the current staff member's clock-in record for today, or null if not yet clocked in
router.get("/my-clockin-today", staffAuthenticationWithCookies, async (req, res) => {
    try {
        const todayStr = new Date().toDateString()
        const clockInRecord = await CLCOKIN.findOne({ staffMember: req.user.id, dateClockedIn: todayStr }).lean()
        return res.status(200).json({ clockIn: clockInRecord || null })
    } catch {
        return res.status(500).json({ message: "Server error" })
    }
})

// Manager resets a staff member's clock-in for today so they can clock in again
router.post("/reset-clockin/:clockInId", authMiddleWare, async (req, res) => {
    try {
        const record = await CLCOKIN.findById(req.params.clockInId)
        if (!record) return res.status(404).json({ message: "Clock-in record not found" })

        const staffId = record.staffMember

        // Delete the paired clock-out record created at clock-in time
        const clockOutRecord = await CLOCKOUT.findOne({ clockInRecord: record._id })
        if (clockOutRecord) {
            await STAFF.findByIdAndUpdate(staffId, { $pull: { clockOutDetails: clockOutRecord._id } })
            await CLOCKOUT.findByIdAndDelete(clockOutRecord._id)
        }

        // Remove the clock-in from the staff member's history and delete it
        await STAFF.findByIdAndUpdate(staffId, { $pull: { clock_In_Details: record._id } })
        await CLCOKIN.findByIdAndDelete(record._id)

        // Notify the staff member in real time so their dashboard updates immediately
        try {
            const io = require('../utils/socket').getIO()
            io.to(`staff_${staffId}`).emit('clockin_reset', {
                message: "Your manager has reset your clock-in. Please clock in again when ready."
            })
        } catch { /* socket unavailable — staff will see the change on next load */ }

        return res.status(200).json({ message: "Clock-in reset successfully" })
    } catch {
        return res.status(500).json({ message: "Server error" })
    }
})

// Push notification routes

// Returns the VAPID public key so browsers can create a push subscription
router.get("/push-vapid-key", (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY })
})

// Staff saves their browser push subscription on their Staff document
router.post("/push-subscribe", staffAuthenticationWithCookies, async (req, res) => {
    const { subscription } = req.body
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ message: 'Invalid subscription object' })
    }
    await STAFF.findByIdAndUpdate(req.user.id, { pushSubscription: subscription })
    return res.status(200).json({ message: 'Push subscription saved' })
})

// Manager saves their browser push subscription on their Manager document
router.post("/push-subscribe-manager", authMiddleWare, async (req, res) => {
    const { subscription } = req.body
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ message: 'Invalid subscription object' })
    }
    // Store per-device; avoid duplicates by endpoint URL
    await MANAGER.findByIdAndUpdate(req.user.id, {
        $pull: { pushSubscriptions: { endpoint: subscription.endpoint } }
    })
    await MANAGER.findByIdAndUpdate(req.user.id, {
        $push: { pushSubscriptions: subscription }
    })
    return res.status(200).json({ message: 'Push subscription saved' })
})

// AI routes

// NLP Shift Manager — staff sends a natural language message
router.post("/chat", chatRateLimit, staffAuthenticationWithCookies, handleChat)

// NLP Manager Assistant — manager sends a natural language message
router.post("/manager-chat", chatRateLimit, authMiddleWare, handleManagerChat)

// Smart Match — manager manually triggers cover search for an open shift
router.post("/find-cover/:shiftId", authMiddleWare, async (req, res) => {
    try{
        const shift = await SHIFT.findById(req.params.shiftId)
        if(!shift) return res.status(404).json({ message : "Shift not found" })
        const candidates = await findCoverCandidates(shift)
        return res.status(200).json({ candidates })
    }catch(err){
        return res.status(500).json({ message : "Smart Match failed", error : err.message })
    }
})

// Cover approval flow ─────────────────────────────────────────────────────────

// Returns all shifts awaiting manager approval before going live in the Marketplace
router.get("/pending-cover-shifts", authMiddleWare, async (req, res) => {
    try {
        const shifts = await SHIFT.find({ status: 'pending_cover' })
            .populate('belongs_to', 'staffName role department email')
            .sort({ date: 1 })
            .lean()
        return res.status(200).json({ shifts })
    } catch(err) {
        return res.status(500).json({ message: 'Failed to fetch pending cover shifts', error: err.message })
    }
})

// Manager approves a pending cover request — shift becomes open_cover and Smart Match fires
router.post("/approve-cover/:id", authMiddleWare, async (req, res) => {
    try {
        const shift = await SHIFT.findById(req.params.id)
        if (!shift || shift.status !== 'pending_cover') {
            return res.status(404).json({ message: 'Shift not found or not awaiting approval.' })
        }
        shift.status = 'open_cover'
        await shift.save()

        try {
            const io = require('../utils/socket').getIO()
            io.to(`staff_${shift.belongs_to}`).emit('cover_approved', {
                shiftId: shift._id,
                date: shift.date,
                message: `Your cover request for ${shift.date} was approved — it's now live in the Marketplace.`
            })
        } catch { /* non-fatal */ }

        // Trigger Smart Match to email top candidates asynchronously
        findCoverCandidates(shift).catch(err =>
            console.error('Smart Match failed after approve-cover:', err.message)
        )

        return res.status(200).json({ message: 'Cover request approved — shift is now live in the Marketplace.' })
    } catch(err) {
        return res.status(500).json({ message: 'Approval failed', error: err.message })
    }
})

// Manager rejects a pending cover request — shift is returned to the original staff member
router.post("/reject-cover/:id", authMiddleWare, async (req, res) => {
    try {
        const shift = await SHIFT.findById(req.params.id)
        if (!shift || shift.status !== 'pending_cover') {
            return res.status(404).json({ message: 'Shift not found or not awaiting approval.' })
        }
        shift.status = 'filled'
        await shift.save()

        try {
            const io = require('../utils/socket').getIO()
            io.to(`staff_${shift.belongs_to}`).emit('cover_rejected', {
                shiftId: shift._id,
                date: shift.date,
                message: `Your cover request for ${shift.date} was not approved by your manager. You are still assigned to this shift.`
            })
        } catch { /* non-fatal */ }

        return res.status(200).json({ message: 'Cover request rejected — shift returned to original staff member.' })
    } catch(err) {
        return res.status(500).json({ message: 'Rejection failed', error: err.message })
    }
})

// Returns all shifts currently live in the Marketplace (open_cover) for manager visibility
router.get("/active-open-shifts", authMiddleWare, async (req, res) => {
    try {
        const shifts = await SHIFT.find({ status: 'open_cover' })
            .populate('belongs_to', 'staffName role department')
            .sort({ date: 1 })
            .lean()
        return res.status(200).json({ shifts })
    } catch(err) {
        return res.status(500).json({ message: 'Failed to fetch active open shifts', error: err.message })
    }
})

// Manager pulls a live open-cover shift back — removed from Marketplace, returned to original owner
router.post("/cancel-open-shift/:id", authMiddleWare, async (req, res) => {
    try {
        const shift = await SHIFT.findById(req.params.id)
        if (!shift || shift.status !== 'open_cover') {
            return res.status(404).json({ message: 'Shift not found or not currently open.' })
        }
        shift.status = 'filled'
        await shift.save()

        try {
            const io = require('../utils/socket').getIO()
            // Remove the card from every open Marketplace view
            io.emit('marketplace_shift_taken', { shiftId: String(shift._id) })
            // Tell the original owner they are back on this shift
            io.to(`staff_${shift.belongs_to}`).emit('cover_rejected', {
                shiftId: shift._id,
                date: shift.date,
                message: `The open shift on ${shift.date} has been pulled from the Marketplace by your manager. You are reassigned to this shift.`
            })
        } catch { /* non-fatal */ }

        return res.status(200).json({ message: 'Open shift cancelled — returned to original staff member.' })
    } catch(err) {
        return res.status(500).json({ message: 'Cancellation failed', error: err.message })
    }
})

// Marketplace — returns all open-cover shifts available for claiming
router.get("/open-shifts", staffAuthenticationWithCookies, async (req, res) => {
    try {
        const shifts = await SHIFT.find({ status: 'open_cover' })
            .populate('belongs_to', 'staffName role department')
            .sort({ date: 1 })
            .lean()
        return res.status(200).json({ shifts })
    } catch(err) {
        return res.status(500).json({ message: 'Failed to fetch open shifts', error: err.message })
    }
})

// Staff claims an open-cover shift from the Marketplace
router.post("/claim-shift/:id", staffAuthenticationWithCookies, claimOpenShift)

module.exports = router;
