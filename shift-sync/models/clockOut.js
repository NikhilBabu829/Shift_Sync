const mongoose = require("mongoose")
const Schema = mongoose.Schema

const ClockOutSchema = new Schema({
    staffMember : {type : Schema.Types.ObjectId, ref : "Staff", required : true},
    startOfShift : {type : String},
    endOfShift : {type : String},
    timeClockedOut : {type : String},
    dateClockedOut : {type : String},
    isLate : {type : Boolean}
})

module.exports = mongoose.model("ClockOut", ClockOutSchema)
