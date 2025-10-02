
const MANAGER = require('../models/manager')
const TOKEN = require('../models/tokenSign')
const bcrypt = require('bcryptjs')
const passport = require('passport')
const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')

const emailValidator = require('email-validator')

const {inviteMember} = require('./sendMails')

const { sendingToken } = require('../utils/mailHtmls') 

exports.manager_sign_up = asyncHandler(async (req, res, next)=>{
    const { first_name, last_name, email, password } = req.body
    const check = await MANAGER.findOne({email : email})
    if(check){
        res.status(400)
        throw new Error("email already exists")
    }
    else{
        bcrypt.hash(password, 15, async(err, hashedPassword)=>{
            if(err){
                res.json(err)
            }
            else{
                const manager = new MANAGER({first_name:first_name, last_name : last_name ,email : email, password : hashedPassword, manager : true})
                await manager.save()
                res.status(200).json({"message" : "Manager Profile created successfully", manager})
            }
        })
    }
})

exports.manager_invite = asyncHandler(async (req, res)=>{
    const{ to, subject, text } = req.body
    try{
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(" ")[1]
    
        const tokenSign = jwt.sign({signed : token}, process.env.JWT_INVITE_SECRET ,{expiresIn : '6h'})
    
        const tokenEntry = new TOKEN({token : tokenSign})
        await tokenEntry.save()
    
        const mailHTML = sendingToken(tokenEntry._id)

        if(emailValidator.validate(to)){
            const inviteResponse = await inviteMember({ to : to, subject : "you've been invited to ...", text : "", html : mailHTML })
            
            if(inviteResponse.accepted && inviteResponse.accepted.length > 0){
                return res.status(200).json({
                    message : "Mail sent successfully",
                    messageId : inviteResponse.messageId
                })
            }else{
                return res.status(400).json({
                    message : "Mail was not accepted by the server please try again later",
                    messageId : inviteResponse.messageId
                })
            }
        }
    }catch(err){
        res.status(400).json({
            message : "Failed to send the mail, plase try agian later",
            err : err
        })
    }
})

