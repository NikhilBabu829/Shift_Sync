const mongoose = require('mongoose')
const Schema = mongoose.Schema;

// Represents an organisation administrator who can manage staff, roster, and swaps
const ManagerSchema = new Schema({
    first_name : { type : String, required : true },    // manager's first name
    last_name : { type : String, required : true },     // manager's last name
    email : { type : String, required : true},          // login email and contact address
    password : {type : String, required : true},        // bcrypt-hashed password
    manager : {type : Boolean, required : true},        // flag that distinguishes managers from staff in shared logic
    org_name : { type : String, default : '' },         // organisation display name shown on the dashboard
    hq_coordinates : {
        lat : { type : Number, default : null },        // headquarters latitude for GPS proximity checks
        lng : { type : Number, default : null }         // headquarters longitude for GPS proximity checks
    },
    locations : {
        type : [{
            name : { type : String, default : 'Site' },
            lat  : { type : Number, required : true },
            lng  : { type : Number, required : true }
        }],
        default : []
    },
    rosterType : { type : String, enum : ['weekly', 'monthly'], default : 'weekly' }, // controls how the roster UI groups shifts
    roles : { type : [String], default : [] },          // organisation-defined role labels available when inviting staff
    pushSubscriptions : { type : [Schema.Types.Mixed], default : [] }  // array of Web Push subscriptions (one per browser/device)
})

module.exports = mongoose.model('Manager', ManagerSchema);
