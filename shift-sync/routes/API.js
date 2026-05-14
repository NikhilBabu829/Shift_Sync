const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')

const chatRateLimit = rateLimit({
    windowMs : 60 * 1000,   // 1 minute window
    max : 5,               // 5 messages per minute
    standardHeaders : true,
    legacyHeaders : false,
    message : { message : 'AI assistant is busy, please try again in a moment.' }
})

const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const TOKEN = require("../models/tokenSign")
const CLCOKIN = require("../models/clockIn")

const { manager_sign_up, manager_invite, swapFinalApproval, download_attendance } = require('../controllers/managerController')
const { checkAuthentication, simulatingUIForAccCreation, creatingStaffAccount, getListOfAllStaffMembers, initiateSwap, staffBAccepts, staffClockIn, staffClockOut, registerFace } = require('../controllers/staffController')
const { handleChat } = require('../controllers/aiController')
const SHIFT = require('../models/shift')
const { findCoverCandidates } = require('../services/smartMatchService')
const passport = require('passport')
const {testMail} = require('../controllers/sendMails')

function authMiddleWare(req, res, next){
    console.log("Entered middleware")
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(" ")[1]
    console.log(authHeader)
    if(token == null) return res.sendStatus(401)
    jwt.verify(token, process.env.JWT_SECRET, (err, user)=>{
        if(err) return res.sendStatus(403)
        req.user = user
        next()
    })
}

async function staffAuthenticationWithCookies(req, res, next){
    let actualToken = '';
    const urlToken = req.query.token;
    const token = req.cookies?.auth;
    const authHeader = req.headers['authorization']
    const authToken = authHeader && authHeader.split(" ")[1]
    if(token != undefined && token.length > 0){actualToken = token}
    if(authToken != undefined && authToken.length > 0){actualToken = authToken}
    if(urlToken != undefined && urlToken.length > 0){actualToken = urlToken}
    if( actualToken.length == 0 ) return res.status(401).json({message : "Unauthorized"})
    try{
        const topLevelToken = jwt.verify(actualToken, process.env.ROOT_SECRET_PASS)
        const userTOken = jwt.verify(topLevelToken.loginToken, process.env.JWT_SECRET)
        req.user = userTOken
        next()
    }catch(err){
        return res.status(401).json({messsage : "Token Expired"})
    }
}

//manager routes

router.get("/download-attendance", download_attendance)

router.post("/manager-login", (req, res, next)=>{
    passport.authenticate("manager-local", {session : false}, (err, user, info)=>{
        if(err){
            return res.status(500).json({message : "Server error please try again"})
        }
        if(!user){
            return res.status(400).json({message : "please check the email and password, and try again!"})
        }
        const token = jwt.sign({id : user.id, email : user.email}, process.env.JWT_SECRET, {expiresIn : "24h"})
        return res.json({token, manager : user})
    })(req, res, next)
})

router.get("/", (req, res, next)=>{
    res.send("connected")
})

router.post("/manager-sign-up", manager_sign_up)

router.post("/staff-add", authMiddleWare, manager_invite)

router.post('/send-mail',authMiddleWare, testMail)

router.post("/swap-final-approval/:id", authMiddleWare, swapFinalApproval)

router.get("/manager-auth", authMiddleWare, async (req, res)=>{
    const manager = await MANAGER.findById(req.user.id)
    return res.status(200).json({user : manager})
})

//staff routes

router.get("/staff-auth", staffAuthenticationWithCookies, async (req, res)=>{
    const userDetails = await STAFF.findById(req.user.id)
    return res.status(200).json({message : "Good to go", user : userDetails})
})

router.get("/see-staff/:id", staffAuthenticationWithCookies, async (req, res)=>{
    try{
        console.log(req.params.id)
        const staffMember = await STAFF.findById(req.params.id)
        if(staffMember){
            return res.status(200).json({staff : staffMember})
        }else{
            return res.status(404).json({message : "Staff member not found"})
        }
    }catch(err){
        return res.status(500).json({message : "Server error"})
    }
})

router.get("/staff",staffAuthenticationWithCookies ,getListOfAllStaffMembers)

router.get("/join/:id", checkAuthentication)

router.post("/initiate-swap", staffAuthenticationWithCookies, initiateSwap)

router.get("/staffB-accepts/:id", staffAuthenticationWithCookies, staffBAccepts)

router.get("/create-staff-acc/:id", creatingStaffAccount)

router.get("/staff-login", passport.authenticate("google", {scope : ['profile', 'email']}))

router.post("/staff-clock-in", staffAuthenticationWithCookies, staffClockIn)

router.post("/staff-clock-out", staffAuthenticationWithCookies, staffClockOut)

router.post("/register-face", staffAuthenticationWithCookies, registerFace)

router.get("/redirectURI", passport.authenticate("google", {failureRedirect : process.env.FRONTEND_URL + "/staff-login"}),async (req, res, next)=>{
    try{
        const {user} = req;
        const staffAccount = await STAFF.findOne({google_id : user.id})
        const state = req.query.state
        if(staffAccount){
            const loginToken = jwt.sign({id : staffAccount.id, email : staffAccount.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
            const topLevelToken = jwt.sign({loginToken}, process.env.ROOT_SECRET_PASS, {expiresIn : '24h'})
            const tokenInURl = new URLSearchParams({
                token : topLevelToken
            })
            return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${tokenInURl}`)
        }else if(state != undefined){
            console.log(user)
            const managerToken = await TOKEN.findById(state)
            jwt.verify(managerToken.token, process.env.JWT_INVITE_SECRET, (err, token)=>{
                jwt.verify(token.signed, process.env.JWT_SECRET, async(err, profile)=>{
                    if(profile){
                        const newUser = new STAFF({
                            google_id : user.id, 
                            email : user.emails?.[0]?.value, 
                            staffName : user.displayName,
                            profile_picture : user.photos?.[0]?.value
                        })
                        await newUser.save()
                        const loginToken = jwt.sign({id : newUser.id, email : newUser.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
                        const topLevelToken = jwt.sign({loginToken}, process.env.ROOT_SECRET_PASS, {expiresIn : '24h'})
                        if(loginToken.length > 0){
                            const deletion = await TOKEN.findByIdAndDelete(state)
                        }
                        const tokenInURL = new URLSearchParams({
                            token : topLevelToken
                        })
                        return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${tokenInURL}`)
                    }else{
                        const msg= new URLSearchParams({
                            error : "You are Not Permitted to do that!"
                        })
                        return res.redirect(`${process.env.FRONTEND_URL}/staff-login?${msg}`)
                    }
                })
            })
        }
        else{   
            const msg = new URLSearchParams({
                error : "Invite Required",
                email : user.email
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

router.get("/view-all-clockins/:id", staffAuthenticationWithCookies, async (req, res)=>{
    try{
        const clockInRecordsOfStaff = await CLCOKIN.find({staffMember : req.params.id})
        return res.status(200).json(clockInRecordsOfStaff)
    }catch(err){
        return res.status(500).json({message : "Server error"})
    }
})

// Org config — returns HQ coordinates for geo-fence (used by ClockIn/ClockOut)
router.get("/org-config", staffAuthenticationWithCookies, async (req, res) => {
    try {
        const manager = await MANAGER.findOne({ 'hq_coordinates.lat': { $ne: null } }, 'org_name hq_coordinates')
        if (!manager) return res.status(404).json({ message: "No organisation config found. Ask your manager to set HQ coordinates." })
        return res.status(200).json({ org_name: manager.org_name, hq_coordinates: manager.hq_coordinates })
    } catch (err) {
        return res.status(500).json({ message: "Server error" })
    }
})

// AI routes

// NLP Shift Manager — staff sends a natural language message
router.post("/chat", chatRateLimit, staffAuthenticationWithCookies, handleChat)

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

module.exports = router;