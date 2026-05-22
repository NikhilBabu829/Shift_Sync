const mongoose = require('mongoose')
const Schema = mongoose.Schema;

// Represents a single roster shift entry; also used to track pending swap proposals
const ShiftSchema = new Schema({
    date : {type : String},                                          // scheduled shift date in YYYY-MM-DD format
    belongs_to : {type : Schema.Types.ObjectId, ref : 'Staff'},     // primary staff member assigned to this shift
    shift_start_time : {type : String},                             // scheduled start time (HH:MM)
    shift_end_time : {type : String},                               // scheduled end time (HH:MM)
    shift_length : {type : Number},                                 // calculated shift duration in fractional hours
    swapDate : {type : String},                                     // proposed swap date (populated during a swap request)
    swap_belongs_to : {type : Schema.Types.ObjectId, ref : 'Staff'}, // the staff member being asked to swap
    swap_shift_start_time : {type : String},                        // the swap partner's shift start time
    swap_shift_end_time : {type : String},                          // the swap partner's shift end time
    swap_shift_length : {type : Number},                            // the swap partner's shift duration in fractional hours
    status : {type : String, enum : ['pending_swap', 'pending_cover', 'open_cover', 'filled', 'approved'], default : 'pending_swap'}, // lifecycle state of the shift
    requiredRole : {type : String, default : 'staff'},              // role required to cover this shift (used by Smart Match)
    shiftDate : {type : Date},                                      // Date object duplicate of date; used for date-comparison queries
    googleCalendarEventId : {type : String}                         // Google Calendar event id; stored so the event can be deleted when the shift is removed
})

// Primary roster query: find shifts for a specific staff member on a specific date
ShiftSchema.index({ belongs_to: 1, date: 1, status: 1 })
// Manager roster view queries by status across all staff
ShiftSchema.index({ status: 1, date: 1 })

module.exports = mongoose.model('Shift', ShiftSchema)
