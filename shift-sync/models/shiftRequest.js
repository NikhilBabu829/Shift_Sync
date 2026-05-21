const mongoose = require('mongoose')
const Schema = mongoose.Schema

// Represents a staff-initiated request to be added to the roster on a specific date
const ShiftRequestSchema = new Schema({
    staffMember:         { type: Schema.Types.ObjectId, ref: 'Staff', required: true }, // staff member who submitted the request
    requestedDate:       { type: String, required: true },   // YYYY-MM-DD
    requestedStartTime:  { type: String, default: null },    // preferred start time (HH:MM); may be overridden by manager on approval
    requestedEndTime:    { type: String, default: null },    // preferred end time (HH:MM); may be overridden by manager on approval
    notes:               { type: String, default: null },    // optional context provided by the staff member
    status:              { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' }, // approval lifecycle state
    createdAt:           { type: Date, default: Date.now }   // submission timestamp for sorting in the manager view
})

module.exports = mongoose.model('ShiftRequest', ShiftRequestSchema)
