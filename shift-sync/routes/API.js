const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')

const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')

const { manager_sign_up, manager_invite } = require('../controllers/managerController')
const { checkAuthentication, simulatingUIForAccCreation, creatingStaffAccount } = require('../controllers/staffController')
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
    const token = jwt.sign({id : manager.id, email : manager.email}, process.env.JWT_SECRET, {expiresIn : '6h'})
    return res.json({token, manager})
})

router.get("/", (req, res, next)=>{
    res.send("connected")
})

router.post("/manager-sign-up", manager_sign_up)

router.post("/staff-add", authMiddleWare, manager_invite)

router.post('/send-mail',authMiddleWare, testMail)

//staff routes

router.get("/join/:id", checkAuthentication)

router.get("/create-staff-acc/:id", simulatingUIForAccCreation)

router.post("/create-staff-acc/:id", creatingStaffAccount)

module.exports = router;