
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
    const { first_name, last_name, email, password, org_name, hq_lat, hq_lng } = req.body
    const check = await MANAGER.findOne({email : email})
    if(check){
        return res.status(400).json({ message: "An account with this email already exists." })
    }
    else{
        bcrypt.hash(password, 15, async(err, hashedPassword)=>{
            if(err){
                res.json(err)
            }
            else{
                const manager = new MANAGER({
                    first_name,
                    last_name,
                    email,
                    password : hashedPassword,
                    manager : true,
                    org_name : org_name || '',
                    hq_coordinates : {
                        lat : hq_lat ? parseFloat(hq_lat) : null,
                        lng : hq_lng ? parseFloat(hq_lng) : null
                    }
                })
                await manager.save()
                res.status(200).json({"message" : "Organisation registered successfully", manager})
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

        const gettingOnlyClockInDates = await CLOCKIN.distinct('dateClockedIn')
    
        const allClockOutDetails = await CLOCKOUT.find().populate('staffMember', 'staffName email').lean()

        console.log(gettingOnlyClockInDates)
    
        const workBook = new ExcelJS.Workbook()
        workBook.creator = 'Shift Sync Server'
        workBook.created = new Date()

        const staffSheet = workBook.addWorksheet('Staff Members')

        // Sort dates chronologically so columns read left-to-right in time order
        gettingOnlyClockInDates.sort()

        staffSheet.columns = [
            {header : "Staff Name", key : "staffName", width : 30},
            ...gettingOnlyClockInDates.map((date, index)=>(
                {header : date, key : `in_${index}`, width : 20}))
        ]

        // Build lookup: staffId → { date → "clockIn – clockOut" }
        const clockOutMap = {}
        for(const record of allClockOutDetails){
            const staffId = String(record.staffMember._id)
            if(!clockOutMap[staffId]) clockOutMap[staffId] = {}
            // key by the clockIn record's linked date via clockInRecord — use dateClockedOut as fallback
            clockOutMap[staffId][String(record.clockInRecord)] = record.timeClockedOut
        }

        const attendanceMap = {}
        for(const record of allClockInDetails){
            const staffId = String(record.staffMember._id)
            if(!attendanceMap[staffId]) attendanceMap[staffId] = {}
            const clockOut = clockOutMap[staffId]?.[String(record._id)]
            attendanceMap[staffId][record.dateClockedIn] = clockOut
                ? `${record.timeClockedIn} – ${clockOut}`
                : record.timeClockedIn
        }

        // One row per staff member
        for(const staff of allStaffMembers){
            const staffId = String(staff._id)
            const row = { staffName : staff.staffName }
            gettingOnlyClockInDates.forEach((date, index) => {
                row[`in_${index}`] = attendanceMap[staffId]?.[date] || ''
            })
            staffSheet.addRow(row)
        }

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
