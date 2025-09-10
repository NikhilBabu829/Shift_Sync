
const MANAGER = require('../models/manager')
const bcrypt = require('bcryptjs')
const passport = require('passport')
const asyncHandler = require('express-async-handler')

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
