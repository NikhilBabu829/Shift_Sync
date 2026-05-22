const mongoose = require('mongoose')
const Schema = mongoose.Schema

// Represents a staff-initiated request to be added to the roster on a specific date.
//
// Lifecycle:
//   pending      — staff submitted; awaiting manager action
//   proposed     — manager sent back a specific time proposal; awaiting staff response
//   staff_agreed — staff accepted the proposal; awaiting manager's final confirmation
//   approved     — manager confirmed; roster shift + Calendar event created
//   denied       — rejected at any stage
const ShiftRequestSchema = new Schema({
    staffMember:        { type: Schema.Types.ObjectId, ref: 'Staff', required: true }, // staff member who submitted the request
    requestedDate:      { type: String, required: true },   // YYYY-MM-DD
    requestedStartTime: { type: String, default: null },    // preferred start time (HH:MM) submitted by staff
    requestedEndTime:   { type: String, default: null },    // preferred end time (HH:MM) submitted by staff
    notes:              { type: String, default: null },    // optional context provided by the staff member
    proposedStartTime:  { type: String, default: null },    // start time proposed by the manager in the counter-offer step
    proposedEndTime:    { type: String, default: null },    // end time proposed by the manager in the counter-offer step
    status:             { type: String, enum: ['pending', 'proposed', 'staff_agreed', 'approved', 'denied'], default: 'pending' },
    createdAt:          { type: Date, default: Date.now }   // submission timestamp for sorting in the manager view
})

// Manager fetches all pending/staff_agreed requests; staff fetches their own proposed requests
ShiftRequestSchema.index({ status: 1, createdAt: 1 })
ShiftRequestSchema.index({ staffMember: 1, status: 1 })

module.exports = mongoose.model('ShiftRequest', ShiftRequestSchema)
