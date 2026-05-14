const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const StaffSchema = new Schema({
    google_id : {type : String},
    email : {type : String},
    staffName : {type : String},
    profile_picture : {type : String},
    role : {type : String, default : 'staff'},
    faceDescriptor : {type : [Number], default : null},
    clock_In_Details : [{type : Schema.Types.ObjectId, ref : "ClockIn"}],
    clockOutDetails : [{type : Schema.Types.ObjectId, ref : "ClockOut"}]
})

module.exports = mongoose.model('Staff', StaffSchema);
