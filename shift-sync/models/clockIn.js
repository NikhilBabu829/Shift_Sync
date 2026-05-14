const mongoose = require('mongoose')

const Schema = mongoose.Schema

const ClockIn = new Schema({
    staffMember : {type : Schema.Types.ObjectId, ref : "Staff", required : true},
    startOfShift : {type : String},
    endOfShift : {type : String},
    timeClockedIn : {type : String},
    dateClockedIn : {type : String},
    isLate : {type : Boolean},
    gpsCoordinates : [
        {
            lat : {type : Number},
            lng : {type : Number},
            timestamp : {type : Number}
        }
    ],
    gpsFlags : {
        isDriveByPunch  : {type : Boolean, default : false},
        isSpoofedGPS    : {type : Boolean, default : false},
        velocityMph     : {type : Number, default : null},
        isolationScore  : {type : Number, default : null}
    },
    faceVerification : {
        registered  : {type : Boolean, default : false},   // did this staff member have a descriptor stored?
        isVerified  : {type : Boolean, default : null},    // null = not attempted, true/false = result
        distance    : {type : Number, default : null}      // Euclidean distance between descriptors
    }
})

module.exports = mongoose.model("ClockIn", ClockIn)
