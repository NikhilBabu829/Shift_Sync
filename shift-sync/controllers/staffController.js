
const STAFF = require('../models/staff')
const TOKEN = require("../models/tokenSign")
const bcrypt = require('bcryptjs')
const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')
const passport = require('passport')

const google = require('passport-google-oauth20').Strategy;

exports.checkAuthentication = asyncHandler(async(req, res)=>{
    const {id} = req.params
    const tokenData = await TOKEN.findById(id)

    if(tokenData){
        jwt.verify(tokenData.token, process.env.JWT_INVITE_SECRET, (err, user)=>{
            if(err) return res.status(401).json({message : "You are unauthorized/restricted to view this site"})
            res.redirect(`http://localhost:3000/api/create-staff-acc/${id}`)
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
            const payload = jwt.verify(tokenData.token, process.env.JWT_INVITE_SECRET)
            console.log(payload)
            return passport.authenticate('google', {
                scope : ['email', 'profile']
            })(req, res, next)
        }catch(err){    
            return res.status(401).json({
                message : "You are unauthorized",
                reason : err.name
            })
        }
    }
})
