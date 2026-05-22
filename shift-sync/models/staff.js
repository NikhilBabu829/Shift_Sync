const mongoose = require('mongoose')
const Schema = mongoose.Schema;

// Represents a staff member who authenticates via Google OAuth
const StaffSchema = new Schema({
    google_id : {type : String, index : true},                     // Google account sub-ID used to link the OAuth profile
    email : {type : String, index : true},                         // staff member's email address from Google
    staffName : {type : String},                                   // display name populated from Google profile
    profile_picture : {type : String},                             // Google profile photo URL
    role : {type : String, default : 'staff'},                     // job role; used by Smart Match to filter cover candidates
    department : {type : String},                                  // organisational department for reporting and filtering
    faceDescriptor : {type : [Number], default : null},            // 128-element face-api.js descriptor used for clock-in verification
    clock_In_Details : [{type : Schema.Types.ObjectId, ref : "ClockIn"}],   // history of clock-in record ids
    clockOutDetails : [{type : Schema.Types.ObjectId, ref : "ClockOut"}],   // history of clock-out record ids
    googleAccessToken : {type : String},                                     // OAuth access token for Google Calendar API calls
    googleRefreshToken : {type : String},                                    // long-lived refresh token used to renew the access token
    pushSubscription : { type : Schema.Types.Mixed, default : null }         // Web Push subscription object stored after browser permission granted
})

module.exports = mongoose.model('Staff', StaffSchema);
