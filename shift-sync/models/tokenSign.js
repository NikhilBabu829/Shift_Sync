const mongoose = require('mongoose')
const Schema = mongoose.Schema;

// Persists a manager-generated invite token so the acceptance route can validate and consume it
const TokenSignSchema = new Schema({
    token : { type : String, require : true },      // signed JWT embedding the manager's auth token; expires in 24h
    email : { type : String, require : true },      // email address the invite was sent to
    role : { type : String },                       // proposed role for the new staff member
    department : { type : String },                 // proposed department for the new staff member
    message : { type : String },                    // optional personal message included in the invite email
    createdAt : { type : Date, default : Date.now } // creation timestamp; used to sort pending invitations
})

module.exports = mongoose.model('ManagerInviteToken', TokenSignSchema)
