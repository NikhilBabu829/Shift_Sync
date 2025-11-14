const mongoose = require('mongoose')

const Schema = mongoose.Schema

const ClockIn = new Schema({
    staffMember : {type : Schema.Types.ObjectId, ref : "Staff", required : true},
    startOfShift : {type : String},
    endOfShift : {type : String},
    timeClockedIn : {type : String},
    dateClockedIn : {type : String},
    isLate : {type : Boolean}
})

module.exports = mongoose.model("ClockIn", ClockIn)
