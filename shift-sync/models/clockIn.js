const mongoose = require('mongoose')

const Schema = mongoose.Schema

// Records a single clock-in event for a staff member, including GPS and face verification data
const ClockIn = new Schema({
    staffMember : {type : Schema.Types.ObjectId, ref : "Staff", required : true}, // staff member who clocked in
    startOfShift : {type : String},    // scheduled shift start time (HH:MM) for late detection
    endOfShift : {type : String},      // scheduled shift end time (HH:MM) for overtime detection
    timeClockedIn : {type : String},   // actual clock-in time as a locale string
    dateClockedIn : {type : String},   // date string used for daily deduplication and attendance queries
    isLate : {type : Boolean},         // true if clock-in time was after the scheduled shift start
    gpsCoordinates : [
        {
            lat : {type : Number},       // latitude reading at this sample
            lng : {type : Number},       // longitude reading at this sample
            timestamp : {type : Number}  // Unix ms timestamp of the GPS sample
        }
    ],
    gpsFlags : {
        isDriveByPunch  : {type : Boolean, default : false}, // true if consecutive readings show vehicle-speed movement
        isSpoofedGPS    : {type : Boolean, default : false}, // true if all coordinates are bit-for-bit identical
        velocityMph     : {type : Number, default : null},   // peak speed detected between any two GPS samples
        isolationScore  : {type : Number, default : null}    // Isolation Forest anomaly score from the ML microservice
    },
    faceVerification : {
        registered  : {type : Boolean, default : false},   // did this staff member have a descriptor stored?
        isVerified  : {type : Boolean, default : null},    // null = not attempted, true/false = result
        distance    : {type : Number, default : null}      // Euclidean distance between descriptors
    }
})

module.exports = mongoose.model("ClockIn", ClockIn)
