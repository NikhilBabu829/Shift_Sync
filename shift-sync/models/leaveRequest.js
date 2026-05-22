const mongoose = require('mongoose')
const Schema = mongoose.Schema

// Lifecycle:
//   pending  — staff submitted; awaiting manager action
//   approved — manager approved; dates are blocked from roster scheduling
//   denied   — manager rejected; staff notified with optional reason
//   revoked  — manager cancelled a previously approved leave
const LeaveRequestSchema = new Schema({
    staffMember:  { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    leaveType:    { type: String, enum: ['sick', 'annual', 'personal'], required: true },
    startDate:    { type: String, required: true },   // YYYY-MM-DD
    endDate:      { type: String, required: true },   // YYYY-MM-DD
    notes:        { type: String, default: null },
    status:                 { type: String, enum: ['pending', 'approved', 'denied', 'revoked'], default: 'pending' },
    managerNotes:           { type: String, default: null },    // optional denial reason from manager
    googleCalendarEventId:  { type: String, default: null },    // stored so the event can be deleted if leave is revoked
    createdAt:              { type: Date, default: Date.now }
})

LeaveRequestSchema.index({ status: 1, createdAt: -1 })
LeaveRequestSchema.index({ staffMember: 1, status: 1 })
// Range query used when blocking roster scheduling on approved-leave dates
LeaveRequestSchema.index({ staffMember: 1, startDate: 1, endDate: 1 })

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema)
