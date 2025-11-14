const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const StaffSchema = new Schema({
    google_id : {type : String},
    email : {type : String},
    staffName : {type : String},
    profile_picture : {type : String},
    clock_In_Details : [{type : Schema.Types.ObjectId, ref : "ClockIn"}]
})

module.exports = mongoose.model('Staff', StaffSchema);
