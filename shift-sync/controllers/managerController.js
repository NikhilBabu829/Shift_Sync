
const MANAGER = require('../models/manager')
const SHIFT = require('../models/shift')
const STAFF = require("../models/staff")
const CLOCKOUT = require("../models/clockOut")
const CLOCKIN = require("../models/clockIn")
const TOKEN = require('../models/tokenSign')
const bcrypt = require('bcryptjs')
const passport = require('passport')
const asyncHandler = require('express-async-handler')
const jwt = require('jsonwebtoken')

const ExcelJS = require('exceljs')

const emailValidator = require('email-validator')

const {inviteMember, managerConfirmationEmail} = require('./sendMails')

const { sendingToken, managerConfirmationMail } = require('../utils/mailHtmls') 

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
    console.log("Manager Invite has begun")
    const{ to, subject, text } = req.body
    try{
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(" ")[1]
        
        const tokenSign = jwt.sign({signed : token}, process.env.JWT_INVITE_SECRET ,{expiresIn : '6h'})
        
        const tokenEntry = new TOKEN({token : tokenSign})
        await tokenEntry.save()
        console.log(tokenEntry)
    
        const mailHTML = sendingToken(tokenEntry._id)

            const inviteResponse = await inviteMember({ to : to, subject : "you've been invited to ...", text : "", html : mailHTML })
            console.log(inviteResponse)
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
    }catch(err){
        res.status(400).json({
            message : "Failed to send the mail, plase try agian later",
            err : err
        })
    }
})

exports.swapFinalApproval = asyncHandler(async (req, res)=>{
    const {id} = req.params
    try{
        const shiftDetails = await SHIFT.findById(id)
        if(shiftDetails){
            const staffA = await STAFF.findById(shiftDetails.belongs_to)
            const staffB = await STAFF.findById(shiftDetails.swap_belongs_to)
            const Manager = await MANAGER.findById(req.user.id)
            const shift = {
                date : shiftDetails.date.toDateString(),
                shift_start_time : shiftDetails.shift_start_time,
                shift_end_time : shiftDetails.shift_end_time,
                swapDate : shiftDetails.swapDate.toDateString(),
                swap_shift_start_time : shiftDetails.swap_shift_start_time,
                swap_shift_end_time : shiftDetails.swap_shift_end_time
            }
            if(staffA && staffB){
                const staffABodyHTML = managerConfirmationMail({to : staffA, staffB : staffB, manager_name : Manager.first_name, shiftDetails : shift})
                const staffBBodyHTML = managerConfirmationMail({to : staffB, staffB : staffA, manager_name : Manager.first_name, shiftDetails : shift})
                const mailToStaffA = await managerConfirmationEmail({data : {to : staffA, bodyHTML : staffABodyHTML}})
                const mailToStaffB = await managerConfirmationEmail({data : {to : staffB, bodyHTML : staffBBodyHTML}})
                if((mailToStaffA.accepted && mailToStaffA.accepted.length > 0) && (mailToStaffB.accepted && mailToStaffB.accepted.length > 0)){
                    return res.status(200).json({
                        message : "Mail has been sent successfully"
                    })
                }else{
                    return res.status(400).json({
                        message : "Mail Delivery Has Failed, please try again!"
                    })
                }
            }
        }
    }catch(err){
        console.log(err)
        res.status(400).json({
            message : "Something went Wrong",
            err : err
        })
    }
})

exports.download_attendance = asyncHandler(async (req, res)=>{

    try{
        const allStaffMembers = await STAFF.find()
    
        const allClockInDetails = await CLOCKIN.find().populate('staffMember', 'staffName email').lean()
    
        const allClockOutDetails = await CLOCKOUT.find().populate('staffMember', 'staffName email').lean()
    
        const workBook = new ExcelJS.Workbook()
        workBook.creator = 'Shift Sync Server'
        workBook.created = new Date()
    
        const staffSheet = workBook.addWorksheet('Staff Members')
    
        let clockInData = {}
    
        staffSheet.columns = [
            {header : "Staff Name", key : "staffName", width : 30},
            ...allClockInDetails.map((clockIn, index)=>(
                {header : `${clockIn.dateClockedIn}`, key : `in_${index}`, width : 20}
            ))
        ]
        
    
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="attendance_export.xlsx"'
        )
        await workBook.xlsx.write(res)
        res.end()
    }catch(err){
        console.log(err)
    }
})
