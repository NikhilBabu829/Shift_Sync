const nodemailer = require('nodemailer')
const asyncHandler = require('express-async-handler')
const { gpsFlagAlert, shiftCoverNotification } = require('../utils/mailHtmls')

const {
    GMAIL,
    GMAIL_PASSWORD
} = process.env

const transporter = nodemailer.createTransport({
    service : "gmail",
    auth : {
        user : GMAIL,
        pass : GMAIL_PASSWORD
    }
})

exports.testMail = asyncHandler(async(req, res)=>{
    try{
        const mailService = await transporter.sendMail({
            from : GMAIL,
            to : "nikhilbabu829@gmail.com",
            subject : "This is a sample mail",
            text : "This here is a sample mail to so and so",
        })
        if(mailService.accepted){
            return res.status(200).json({
                message : "Mail sent successfully",
                messageId : mailService.messageId
            })
        }else{
            return res.status(400).json({
                message : "Message was not accepted by the server try again!",
                messageId : mailService.messageId
            })
        }
    }catch(err){
        res.send({"message" : "Failed to send the mail, please try again!", err})
    }
})

exports.inviteMember = asyncHandler(async (data)=>{
    try{
        const mailService = await transporter.sendMail({
            from : GMAIL,
            to : data.to,
            subject : data.subject,
            text : data.text,
            html : data.html
        })
        return mailService
    }catch(err){
        return err;
    }
})

exports.swapInitiate = asyncHandler(async (data)=>{
    try{
        const mailService = await transporter.sendMail({
            from : GMAIL,
            to : data.to,
            subject : `Shift Swap Request from ${data.belongsToStaffName} on ${data.date} from ${data.shift_start_time} till ${data.shift_end_time}`,
            html : data.bodyHTML
        })
        return mailService
    }catch(err){
        return err;
    }
})

exports.staffConfirmationEmail = asyncHandler(async (data)=>{
    try{
        const mailService = await transporter.sendMail({
            from : GMAIL,
            to : data.to,
            subject : `Your Shift Swap Confirmation Has Been Sent to the Manager, ${data.id}`,
            html : data.bodyHTML
        })
        return mailService
    }catch(err){
        return err;
    }
})

exports.swapForwardToManagerEmail = asyncHandler(async (data)=>{
    try{
        const mailService = await transporter.sendMail({
            from : GMAIL,
            to : data.to,
            subject : `Shift Swap Request Pending Your Approval — ${data.belongs_to} ⇄ ${data.swap_belongs_to}`,
            html : data.bodyHTML
        })
        return mailService
    }catch(err){
        return err;
    }
})

exports.notifyManagerGpsFlag = async (managerEmail, alertData) => {
    try{
        const bodyHTML = gpsFlagAlert(alertData)
        await transporter.sendMail({
            from : GMAIL,
            to : managerEmail,
            subject : `GPS Alert: Suspicious Clock-In by ${alertData.staffName}`,
            html : bodyHTML
        })
    }catch(err){
        console.error('GPS flag email failed:', err.message)
    }
}

exports.notifyCoverCandidates = async (candidates) => {
    for(const candidate of candidates){
        try{
            const bodyHTML = shiftCoverNotification({
                staffName : candidate.staffName,
                shiftDate : candidate.shiftDate,
                startTime : candidate.startTime,
                endTime : candidate.endTime,
                score : candidate.score
            })
            await transporter.sendMail({
                from : GMAIL,
                to : candidate.email,
                subject : `Shift Coverage Opportunity — ${candidate.shiftDate}`,
                html : bodyHTML
            })
        }catch(err){
            console.error(`Cover notify failed for ${candidate.email}:`, err.message)
        }
    }
}

exports.managerConfirmationEmail = asyncHandler(async (data)=>{
    try{
        const { to, bodyHTML } = data.data
        const mailService = await transporter.sendMail({
            from : GMAIL,
            to : to.email,
            subject : `Your Shift Swap Has Been Approved — Shift-Sync`,
            html : bodyHTML
        })
        return mailService
    }catch(err){
        return err;
    }
})
