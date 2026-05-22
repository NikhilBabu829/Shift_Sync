const asyncHandler = require('express-async-handler')
const LEAVE_REQUEST = require('../models/leaveRequest')
const STAFF = require('../models/staff')
const MANAGER = require('../models/manager')
const { notifyManagerNewLeave, notifyStaffLeaveDecision } = require('./sendMails')
const { createLeaveEvent, deleteShiftEvent } = require('../services/googleCalendarService')

function getIO() {
    try { return require('../utils/socket').getIO() } catch { return null }
}

// Staff submits a new leave request
exports.submitLeaveRequest = asyncHandler(async (req, res) => {
    const { leaveType, startDate, endDate, notes } = req.body
    if (!leaveType || !startDate || !endDate) {
        return res.status(400).json({ message: 'leaveType, startDate, and endDate are required' })
    }
    if (!['sick', 'annual', 'personal'].includes(leaveType)) {
        return res.status(400).json({ message: 'Invalid leaveType' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ message: 'Dates must be in YYYY-MM-DD format' })
    }
    if (startDate > endDate) {
        return res.status(400).json({ message: 'startDate must be on or before endDate' })
    }

    const leave = new LEAVE_REQUEST({
        staffMember: req.user.id,
        leaveType,
        startDate,
        endDate,
        notes: notes || null,
    })
    await leave.save()

    // Notify manager by email and real-time socket (non-blocking)
    try {
        const [staff, manager] = await Promise.all([
            STAFF.findById(req.user.id).select('staffName email').lean(),
            MANAGER.findOne({}).select('email firstName').lean()
        ])
        if (staff && manager) {
            notifyManagerNewLeave({
                to:          manager.email,
                managerName: manager.firstName || 'Manager',
                staffName:   staff.staffName,
                leaveType,
                startDate,
                endDate,
                notes:       notes || null,
            })
        }
        const io = getIO()
        if (io) {
            io.to('managers').emit('leave_request_submitted', {
                leaveId:   leave._id,
                staffName: staff?.staffName || 'A staff member',
                leaveType,
                startDate,
                endDate,
                notes:     notes || null,
            })
        }
    } catch { /* socket/email failure must not block the response */ }

    return res.status(201).json({ leave, message: 'Leave request submitted' })
})

// Staff views their own leave request history
exports.getMyLeaveRequests = asyncHandler(async (req, res) => {
    const leaves = await LEAVE_REQUEST.find({ staffMember: req.user.id })
        .sort({ createdAt: -1 })
        .lean()
    return res.status(200).json({ leaves })
})

// Manager retrieves all pending leave requests across all staff
exports.getPendingLeaveRequests = asyncHandler(async (req, res) => {
    const leaves = await LEAVE_REQUEST.find({ status: 'pending' })
        .sort({ createdAt: 1 })
        .populate('staffMember', 'staffName email department role')
        .lean()
    return res.status(200).json({ leaves })
})

// Manager approves a leave request
exports.approveLeaveRequest = asyncHandler(async (req, res) => {
    const leave = await LEAVE_REQUEST.findById(req.params.id).populate('staffMember', 'staffName email')
    if (!leave) return res.status(404).json({ message: 'Leave request not found' })
    if (leave.status !== 'pending') {
        return res.status(400).json({ message: 'This request has already been resolved' })
    }

    leave.status = 'approved'
    await leave.save()

    // Mirror the approved leave as an all-day event on the staff member's Google Calendar
    const staffDoc = await STAFF.findById(leave.staffMember._id).select('googleAccessToken googleRefreshToken email _id').lean()
    if (staffDoc?.googleAccessToken) {
        const calEventId = await createLeaveEvent(staffDoc, leave)
        if (calEventId) {
            leave.googleCalendarEventId = calEventId
            await leave.save()
        }
    }

    notifyStaffLeaveDecision({
        to:           leave.staffMember.email,
        staffName:    leave.staffMember.staffName,
        leaveType:    leave.leaveType,
        startDate:    leave.startDate,
        endDate:      leave.endDate,
        status:       'approved',
        managerNotes: null,
    })

    try {
        const io = getIO()
        if (io) {
            io.to(`staff_${leave.staffMember._id}`).emit('leave_approved', {
                leaveType:    leave.leaveType,
                startDate:    leave.startDate,
                endDate:      leave.endDate,
            })
        }
    } catch { /* non-critical */ }

    return res.status(200).json({ leave, message: 'Leave request approved' })
})

// Manager denies a leave request with an optional reason
exports.denyLeaveRequest = asyncHandler(async (req, res) => {
    const { managerNotes } = req.body
    const leave = await LEAVE_REQUEST.findById(req.params.id).populate('staffMember', 'staffName email')
    if (!leave) return res.status(404).json({ message: 'Leave request not found' })
    if (leave.status !== 'pending') {
        return res.status(400).json({ message: 'This request has already been resolved' })
    }

    leave.status       = 'denied'
    leave.managerNotes = managerNotes || null
    await leave.save()

    notifyStaffLeaveDecision({
        to:           leave.staffMember.email,
        staffName:    leave.staffMember.staffName,
        leaveType:    leave.leaveType,
        startDate:    leave.startDate,
        endDate:      leave.endDate,
        status:       'denied',
        managerNotes: managerNotes || null,
    })

    try {
        const io = getIO()
        if (io) {
            io.to(`staff_${leave.staffMember._id}`).emit('leave_denied', {
                leaveType:    leave.leaveType,
                startDate:    leave.startDate,
                endDate:      leave.endDate,
                managerNotes: managerNotes || null,
            })
        }
    } catch { /* non-critical */ }

    return res.status(200).json({ leave, message: 'Leave request denied' })
})

// Manager retrieves all leave requests with optional filters: from, to, staffId, status
exports.getAllLeaveRequests = asyncHandler(async (req, res) => {
    const { from, to, staffId, status } = req.query
    const filter = {}
    if (status) filter.status = status
    if (staffId) filter.staffMember = staffId
    if (from || to) {
        // Return any leave that overlaps the queried range
        if (from) filter.endDate   = { ...filter.endDate,   $gte: from }
        if (to)   filter.startDate = { ...filter.startDate, $lte: to }
    }
    const leaves = await LEAVE_REQUEST.find(filter)
        .sort({ startDate: 1, createdAt: -1 })
        .populate('staffMember', 'staffName email department role')
        .lean()
    return res.status(200).json({ leaves })
})

// Manager revokes a previously approved leave — deletes the Google Calendar event and notifies staff
exports.revokeLeaveRequest = asyncHandler(async (req, res) => {
    const { managerNotes } = req.body
    const leave = await LEAVE_REQUEST.findById(req.params.id).populate('staffMember', 'staffName email _id')
    if (!leave) return res.status(404).json({ message: 'Leave request not found' })
    if (leave.status !== 'approved') {
        return res.status(400).json({ message: 'Only approved leave can be revoked' })
    }

    // Delete the Google Calendar event if one was created
    if (leave.googleCalendarEventId) {
        const staffDoc = await STAFF.findById(leave.staffMember._id)
            .select('googleAccessToken googleRefreshToken _id')
            .lean()
        if (staffDoc?.googleAccessToken) {
            await deleteShiftEvent(staffDoc, leave.googleCalendarEventId)
        }
    }

    leave.status       = 'revoked'
    leave.managerNotes = managerNotes || null
    leave.googleCalendarEventId = null
    await leave.save()

    notifyStaffLeaveDecision({
        to:           leave.staffMember.email,
        staffName:    leave.staffMember.staffName,
        leaveType:    leave.leaveType,
        startDate:    leave.startDate,
        endDate:      leave.endDate,
        status:       'revoked',
        managerNotes: managerNotes || null,
    })

    try {
        const io = getIO()
        if (io) {
            io.to(`staff_${leave.staffMember._id}`).emit('leave_revoked', {
                leaveType:    leave.leaveType,
                startDate:    leave.startDate,
                endDate:      leave.endDate,
                managerNotes: managerNotes || null,
            })
        }
    } catch { /* non-critical */ }

    return res.status(200).json({ leave, message: 'Leave revoked' })
})
