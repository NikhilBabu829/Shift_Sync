const nodemailer = require('nodemailer')
const asyncHandler = require('express-async-handler')

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
