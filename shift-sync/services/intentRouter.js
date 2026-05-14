/**
 * Intent Router — maps structured Gemini output to actual database operations.
 * This is the glue between the NLP layer and the existing business logic.
 */

const SHIFT = require('../models/shift')
const CLOCKIN = require('../models/clockIn')
const STAFF = require('../models/staff')

/**
 * Routes a parsed Gemini intent to a DB action.
 * @param {object} parsedIntent — output from geminiService.parseShiftIntent
 * @param {string} staffId — MongoDB ObjectId of the requesting staff member
 * @returns {{ action, data, message }}
 */
async function routeIntent(parsedIntent, staffId) {
    try {
        const { intent, date, shift_time, targetStaffId, notes } = parsedIntent

        switch (intent) {

            case 'drop_shift':
            case 'report_sick': {
            // Find the shift that belongs to this staff member on the given date
            const query = { belongs_to : staffId }
            if (date) query.date = date
            if (shift_time) query.shift_start_time = shift_time

            const shift = await SHIFT.findOne(query)
            if (!shift) {
                return {
                    action : intent,
                    data : null,
                    message : date
                        ? `No shift found for you on ${date}. Please check the date and try again.`
                        : 'Could not find a matching shift. Please specify a date.'
                }
            }

            shift.status = 'open_cover'
            await shift.save()

            // Trigger Smart Match asynchronously (imported inline to avoid circular deps)
                const { findCoverCandidates } = require('./smartMatchService')
                findCoverCandidates(shift).catch((err) =>
                    console.error('Smart Match failed after drop_shift:', err.message)
                )

                return {
                    action : intent,
                    data : { shiftId : shift._id, date : shift.date, status : 'open_cover' },
                    message : intent === 'report_sick'
                        ? `Got it — your shift on ${shift.date} has been opened for coverage and the team has been notified. Feel better soon.`
                        : `Your shift on ${shift.date} has been marked as needing cover. We'll notify available staff.`
                }
            }

            case 'request_cover': {
            // Same as drop_shift but with explicit "find someone to cover me" framing
            const query = { belongs_to : staffId }
            if (date) query.date = date

            const shift = await SHIFT.findOne(query)
            if (!shift) {
                return {
                    action : 'request_cover',
                    data : null,
                    message : `No shift found${date ? ` on ${date}` : ''}. Please provide a date.`
                }
            }

            shift.status = 'open_cover'
            await shift.save()

                const { findCoverCandidates } = require('./smartMatchService')
                findCoverCandidates(shift).catch((err) =>
                    console.error('Smart Match failed after request_cover:', err.message)
                )

                return {
                    action : 'request_cover',
                    data : { shiftId : shift._id, date : shift.date },
                    message : `Your shift on ${shift.date} is now open for cover. The best available staff have been notified.`
                }
            }

            case 'request_swap': {
            if (!targetStaffId) {
                // Return the list of all staff so the frontend can let the user pick
                const allStaff = await STAFF.find({ _id : { $ne : staffId } }).select('staffName email _id')
                return {
                    action : 'request_swap',
                    data : { staffList : allStaff },
                    message : 'Who would you like to swap with? Here are your teammates.'
                }
            }

                const targetStaff = await STAFF.findById(targetStaffId).select('staffName')
                if (!targetStaff) {
                    return { action : 'request_swap', data : null, message : 'Could not find that team member.' }
                }

                return {
                    action : 'request_swap',
                    data : { targetStaffId, targetStaffName : targetStaff.staffName },
                    message : `To swap with ${targetStaff.staffName}, please use the shift swap screen in the app with the specific dates.`
                }
            }

            case 'query_schedule': {
            const query = { staffMember : staffId }
            if (date) query.dateClockedIn = date

            const clockIns = await CLOCKIN.find(query)
                .sort({ dateClockedIn : -1 })
                .limit(10)
                .lean()

            return {
                action : 'query_schedule',
                data : { clockIns },
                message : clockIns.length > 0
                    ? `Here are your last ${clockIns.length} clock-in record(s).`
                    : 'No clock-in records found for that period.'
            }
        }

            default:
                return {
                    action : 'clarification_needed',
                    data : null,
                    message : "I couldn't quite parse that shift request. Could you specify the date and time?"
                }
        }
    } catch (err) {
        console.error('Error routing intent:', err);
        return {
            action : 'clarification_needed',
            data : null,
            message : "I couldn't quite parse that shift request. Could you specify the date and time?"
        }
    }
}

module.exports = { routeIntent }
