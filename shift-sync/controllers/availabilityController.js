const asyncHandler = require('express-async-handler')
const AVAILABILITY = require('../models/staffAvailability')

// Upserts a single availability entry for the authenticated staff member.
// Body: { type, dayOfWeek?, date?, available, startTime?, endTime? }
exports.setAvailability = asyncHandler(async (req, res) => {
    const { type, dayOfWeek, date, available, startTime, endTime } = req.body

    if (!type || !['weekly', 'date'].includes(type)) {
        return res.status(400).json({ message: 'type must be "weekly" or "date"' })
    }
    if (typeof available !== 'boolean') {
        return res.status(400).json({ message: 'available must be a boolean' })
    }
    if (type === 'weekly' && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6)) {
        return res.status(400).json({ message: 'dayOfWeek (0–6) is required for weekly entries' })
    }
    if (type === 'date' && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
        return res.status(400).json({ message: 'date (YYYY-MM-DD) is required for date entries' })
    }
    if (available && startTime && endTime && startTime >= endTime) {
        return res.status(400).json({ message: 'startTime must be before endTime' })
    }

    const filter = type === 'weekly'
        ? { staffMember: req.user.id, type: 'weekly', dayOfWeek: Number(dayOfWeek) }
        : { staffMember: req.user.id, type: 'date', date }

    const update = {
        available,
        startTime:  available && startTime ? startTime : null,
        endTime:    available && endTime   ? endTime   : null,
        updatedAt:  new Date()
    }

    const entry = await AVAILABILITY.findOneAndUpdate(filter, { $set: update }, { upsert: true, new: true })
    return res.status(200).json({ entry })
})

// Returns all availability entries for the authenticated staff member.
exports.getMyAvailability = asyncHandler(async (req, res) => {
    const entries = await AVAILABILITY.find({ staffMember: req.user.id }).lean()
    return res.status(200).json({ entries })
})

// Removes a single availability entry. Body: { type, dayOfWeek? | date? }
exports.removeAvailability = asyncHandler(async (req, res) => {
    const { type, dayOfWeek, date } = req.body

    if (!type || !['weekly', 'date'].includes(type)) {
        return res.status(400).json({ message: 'type must be "weekly" or "date"' })
    }

    const filter = type === 'weekly'
        ? { staffMember: req.user.id, type: 'weekly', dayOfWeek: Number(dayOfWeek) }
        : { staffMember: req.user.id, type: 'date', date }

    await AVAILABILITY.findOneAndDelete(filter)
    return res.status(200).json({ message: 'Availability entry removed' })
})

// Manager views a specific staff member's full availability schedule.
exports.getStaffAvailability = asyncHandler(async (req, res) => {
    const entries = await AVAILABILITY.find({ staffMember: req.params.id })
        .sort({ type: 1, dayOfWeek: 1, date: 1 })
        .lean()
    return res.status(200).json({ entries })
})
