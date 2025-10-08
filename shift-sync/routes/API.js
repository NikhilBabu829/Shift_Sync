const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const MANAGERINVITETOKEN = require('../models/tokenSign')

const { manager_sign_up, manager_invite } = require('../controllers/managerController')
const { checkAuthentication, simulatingUIForAccCreation, creatingStaffAccount, getListOfAllStaffMembers, initiateSwap } = require('../controllers/staffController')
const passport = require('passport')
const {testMail} = require('../controllers/sendMails')

function authMiddleWare(req, res, next){
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(" ")[1]
    if(token == null) return res.sendStatus(401)
    jwt.verify(token, process.env.JWT_SECRET, (err, user)=>{
        if(err) return res.sendStatus(403)
        req.user = user
        next()
    })
}

//manager routes
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

//staff routes

router.get("/staff",authMiddleWare ,getListOfAllStaffMembers)

router.post("/initiate-swap", authMiddleWare, initiateSwap)

router.get("/join/:id", checkAuthentication)

// router.get("/create-staff-acc/:id", simulatingUIForAccCreation)

router.get("/staff-login", passport.authenticate('google', {failureRedirect : "/", scope : ['email', 'profile']}), async(req, res)=>{
    try{
        const {user} = req;
        const staffAccount = await STAFF.findOne({google_id : user.id})
        if(staffAccount){
            const loginToken = jwt.sign({id : staffAccount.id, email : staffAccount.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
            return res.status(200).json({
                token : loginToken,
                staff : staffAccount
            })
        }else{
        }
    }catch(err){
        console.log(err)
    }
})

router.get("/create-staff-acc/:id", creatingStaffAccount)

router.get('/redirectURI', passport.authenticate('google', {failureRedirect : '/'}), async (req, res)=>{
    const {user} = req;
    const staffAccount = await STAFF.findOne({google_id : user.id})
    const managerToken_id = req.query.state
    if(staffAccount){
        const loginToken = jwt.sign({id : staffAccount.id, email : staffAccount.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
        const deletion = await MANAGERINVITETOKEN.findByIdAndDelete(managerToken_id)
        return res.status(200).json({
            token : loginToken,
            staff : staffAccount
        })
    }else{
        const staffAccount = new STAFF({ 
            google_id : user.id,
            email : user.emails[0].value,
            staffName : user.displayName
        })
        await staffAccount.save()
        const jsonToken = jwt.sign({id : staffAccount.id, email : staffAccount.email}, process.env.JWT_SECRET, {expiresIn : '24h'})
        if(jsonToken.length > 0){
            const deletion = await MANAGERINVITETOKEN.findByIdAndDelete(managerToken_id)
        }
        return res.status(200).json({
            token : jsonToken,
            staff : staffAccount
        })
    }
})

module.exports = router;