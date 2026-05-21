const mongoose = require("mongoose")
const Schema = mongoose.Schema

// Records a single clock-out event; created at clock-in time and filled in when the staff member clocks out
const ClockOutSchema = new Schema({
    staffMember : {type : Schema.Types.ObjectId, ref : "Staff", required : true},  // staff member who will clock out
    clockInRecord : {type : Schema.Types.ObjectId, ref : "ClockIn", required : true}, // links back to the matching clock-in for attendance reporting
    startOfShift : {type : String},    // scheduled start time copied from the roster shift
    endOfShift : {type : String},      // scheduled end time copied from the roster shift
    timeClockedOut : {type : String},  // actual clock-out time; absent until the staff member clocks out
    dateClockedOut : {type : String},  // date of clock-out for date-range filtering in reports
    isLate : {type : Boolean}          // true if the staff member left before or after their scheduled end
})

module.exports = mongoose.model("ClockOut", ClockOutSchema)
