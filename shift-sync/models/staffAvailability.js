const mongoose = require('mongoose')
const Schema = mongoose.Schema

// Stores a staff member's declared working availability.
//
// type = 'weekly': a recurring weekly pattern entry (one per dayOfWeek per staff member).
//   dayOfWeek: 0 = Sunday … 6 = Saturday (matches Date.prototype.getDay())
//
// type = 'date': a one-off override for a specific calendar date.
//   date: YYYY-MM-DD
//
// If available = false the entire day/date is blocked — startTime/endTime are ignored.
// If available = true with startTime/endTime the staff member is only available within
//   that window. A shift must fit entirely within the window to be considered eligible.
// If available = true with no startTime/endTime the staff member is available all day.
const StaffAvailabilitySchema = new Schema({
    staffMember: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    type:        { type: String, enum: ['weekly', 'date'], required: true },
    dayOfWeek:   { type: Number, min: 0, max: 6, default: null },  // used when type = 'weekly'
    date:        { type: String, default: null },                   // YYYY-MM-DD, used when type = 'date'
    available:   { type: Boolean, required: true },
    startTime:   { type: String, default: null },                   // HH:MM — null means all day
    endTime:     { type: String, default: null },                   // HH:MM — null means all day
    updatedAt:   { type: Date, default: Date.now }
})

// Enforce one entry per staff member per day-of-week (weekly) or per date (date override)
StaffAvailabilitySchema.index({ staffMember: 1, type: 1, dayOfWeek: 1 }, { sparse: true })
StaffAvailabilitySchema.index({ staffMember: 1, type: 1, date: 1 },       { sparse: true })

module.exports = mongoose.model('StaffAvailability', StaffAvailabilitySchema)
