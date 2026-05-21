// Nodemailer for sending transactional emails via Gmail SMTP
const nodemailer = require('nodemailer')
// Wraps async functions and forwards thrown errors to Express error handler
const asyncHandler = require('express-async-handler')
// HTML email template builders for alert and notification emails
const { gpsFlagAlert, shiftCoverNotification, faceMismatchAlert } = require('../utils/mailHtmls')

// Gmail credentials pulled from environment variables
const {
    GMAIL,
    GMAIL_PASSWORD
} = process.env

// Shared nodemailer transporter used by all export functions in this module
const transporter = nodemailer.createTransport({
    service : "gmail",
    auth : {
        user : GMAIL,
        pass : GMAIL_PASSWORD
    }
})

// Development/test route handler — sends a hardcoded test email to verify transporter works
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

// Sends a staff invite email; data contains { to, subject, text, html }
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

// Sends the initial shift swap request email to Staff B with the agree/reject action links
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

// Sends a swap confirmation email to a staff member (used for both Staff A and Staff B)
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

// Forwards the swap request to the manager's email for final approval
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

// Sends a GPS fraud alert email to a single manager; called after a suspicious clock-in
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

// Sends a face mismatch alert email to a single manager when face verification fails at clock-in
exports.notifyManagerFaceMismatch = async (managerEmail, alertData) => {
    try {
        const bodyHTML = faceMismatchAlert(alertData)
        await transporter.sendMail({
            from    : GMAIL,
            to      : managerEmail,
            subject : `Face Verification Failed: ${alertData.staffName} — ${alertData.dateClockedIn}`,
            html    : bodyHTML
        })
    } catch(err) {
        console.error('Face mismatch email failed:', err.message)
    }
}

// Sends shift coverage opportunity emails to each candidate returned by Smart Match
exports.notifyCoverCandidates = async (candidates) => {
    for(const candidate of candidates){
        try{
            // Build a personalised email for each candidate including their match score
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

// Sends the manager's final swap approval email to a staff member; data.data contains { to, bodyHTML }
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
