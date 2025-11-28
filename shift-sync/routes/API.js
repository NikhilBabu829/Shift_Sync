const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const TOKEN = require("../models/tokenSign")

const { manager_sign_up, manager_invite, swapFinalApproval, download_attendance } = require('../controllers/managerController')
const { checkAuthentication, simulatingUIForAccCreation, creatingStaffAccount, getListOfAllStaffMembers, initiateSwap, staffBAccepts, staffClockIn, staffClockOut } = require('../controllers/staffController')
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
    const token = req.cookies?.auth;
    const authHeader = req.headers['authorization']
    const authToken = authHeader && authHeader.split(" ")[1]
    if(token != undefined && token.length > 0){actualToken = token}
    if(authToken != undefined && authToken.length > 0){actualToken = authToken}
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

router.post("/manager-login", passport.authenticate("manager-local", {session : false}), (req, res)=>{
    const manager = req.user
    const token = jwt.sign({id : manager.id, email : manager.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
    return res.json({token, manager})
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

router.get("/staff",staffAuthenticationWithCookies ,getListOfAllStaffMembers)

router.get("/join/:id", checkAuthentication)

router.post("/initiate-swap", staffAuthenticationWithCookies, initiateSwap)

router.get("/staffB-accepts/:id", staffAuthenticationWithCookies, staffBAccepts)

router.get("/create-staff-acc/:id", creatingStaffAccount)

router.get("/staff-login", passport.authenticate("google", {scope : ['profile', 'email']}))

router.post("/staff-clock-in", staffAuthenticationWithCookies, staffClockIn)

router.post("/staff-clock-out", staffAuthenticationWithCookies, staffClockOut)

router.get("/redirectURI", passport.authenticate("google", {failureRedirect : "http://localhost:5173/staff-login"}),async (req, res, next)=>{
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
            return res.redirect(`http://localhost:5173/staff-login?${tokenInURl}`)
            // res.cookie('auth', loginToken, {
            //     httpOnly : true,
            //     sameSite : 'lax',
            //     path : "/",
            //     secure : false,
            //     maxAge : 86400000
            // }).redirect("http://localhost:5173/dashboard")
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

                        const newUserToken = jwt.sign({id : newUser.id, email : newUser.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
                        const topLevelToken = jwt.sign({newUserToken}, process.env.ROOT_SECRET_PASS, {expiresIn : '24h'})
                        if(newUserToken.length > 0){
                            const deletion = await TOKEN.findByIdAndDelete(state)
                        }
                        return res.status(200).json({token : topLevelToken})
                        // return res.cookie('auth', newUserToken, {
                        //     httpOnly : true,
                        //     sameSite : 'lax',
                        //     path : "/",
                        //     secure : false,
                        //     maxAge : 86400000
                        // }).redirect("http://localhost:5173/dashboard")
                    }else{
                        const msg= new URLSearchParams({
                            error : "You are Not Permitted to do that!"
                        })
                        return res.redirect(`http://localhost:5173/staff-login?${msg}`)
                    }
                })
            })
        }
        else{   
            const msg = new URLSearchParams({
                error : "Invite Required",
                email : user.email
            }).toString()
            return res.redirect(`http://localhost:5173/staff-login?${msg}`)
        }
    }catch(err){
        const msg = new URLSearchParams({
            error : err
        }).toString()
        return res.redirect(`http://localhost:5173/staff-login?${msg}`)
    }
})

module.exports = router;