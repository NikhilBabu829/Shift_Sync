/**
 * googleCalendarService.js
 *
 * Provides two functions used by the roster controllers to keep a staff member's
 * Google Calendar in sync with their shifts:
 *
 *   createShiftEvent(staff, shift) — inserts a new calendar event on the staff
 *     member's primary Google Calendar whenever the manager adds a roster shift.
 *     Returns the Google Calendar event id so it can be persisted on the Shift
 *     document for later deletion.
 *
 *   deleteShiftEvent(staff, eventId) — removes the calendar event when the
 *     manager deletes the corresponding roster shift.
 *
 * Both functions are non-fatal: a Calendar API failure is logged but never
 * propagates, so a missing or expired token never blocks a roster save.
 *
 * Prerequisites:
 *   • Staff member must have granted the calendar scope (happens automatically
 *     on their next Google login after the scope was added to the OAuth flow).
 *   • GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL and TIMEZONE
 *     must be set in .env.
 *   • Google Calendar API must be enabled in the Google Cloud Console project.
 */

const { google } = require('googleapis')
const STAFF = require('../models/staff')

/**
 * Builds a fully configured OAuth2 client for the given staff member.
 *
 * The client is seeded with the staff member's stored access and refresh tokens.
 * A 'tokens' event listener is attached so that whenever googleapis automatically
 * refreshes an expired access token the new token is immediately written back to
 * MongoDB — without this, the next API call would re-use the stale token and fail.
 */
function buildOAuth2Client(staff) {
    const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_CALLBACK_URL
    )
    client.setCredentials({
        access_token: staff.googleAccessToken,
        refresh_token: staff.googleRefreshToken,
    })
    // Persist refreshed access tokens so future API calls don't fail with a stale token
    client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            await STAFF.findByIdAndUpdate(staff._id, { googleAccessToken: tokens.access_token })
            console.log(`[Calendar] Refreshed access token saved for staff ${staff._id}`)
        }
    })
    return client
}

/**
 * Creates a Google Calendar event on the staff member's primary calendar for the given shift.
 *
 * The event datetime is constructed from the shift's date string (YYYY-MM-DD) and
 * HH:MM time strings, interpreted in the TIMEZONE env var (defaults to UTC).
 * A 60-minute popup reminder is added so the staff member is notified before their shift.
 *
 * @param {Object} staff  - Mongoose Staff document with googleAccessToken / googleRefreshToken
 * @param {Object} shift  - Mongoose Shift document with date, shift_start_time, shift_end_time
 * @returns {string|null} - Google Calendar event id on success, null on failure or missing tokens
 */
async function createShiftEvent(staff, shift) {
    // Skip silently if the staff member has not yet granted the calendar scope
    if (!staff.googleAccessToken) {
        console.warn(`[Calendar] Skipping event creation — no access token stored for staff ${staff._id} (${staff.email})`)
        return null
    }

    const auth = buildOAuth2Client(staff)
    const calendar = google.calendar({ version: 'v3', auth })

    // Build RFC 3339 datetime strings from the plain date and time fields stored on the shift
    const startISO = `${shift.date}T${shift.shift_start_time}:00`
    const endISO   = `${shift.date}T${shift.shift_end_time}:00`

    const event = {
        summary: 'Work Shift - Shift Sync',
        description: `You have a scheduled shift from ${shift.shift_start_time} to ${shift.shift_end_time}.`,
        // timeZone tells Google Calendar how to interpret the naive datetime strings above
        start: { dateTime: startISO, timeZone: process.env.TIMEZONE || 'UTC' },
        end:   { dateTime: endISO,   timeZone: process.env.TIMEZONE || 'UTC' },
        reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: 60 }],
        },
    }

    try {
        const response = await calendar.events.insert({ calendarId: 'primary', requestBody: event })
        console.log(`[Calendar] Event created for staff ${staff._id}, eventId: ${response.data.id}`)
        return response.data.id
    } catch (err) {
        // Surface the full Google error detail (status + message) rather than just err.message
        const detail = err.response?.data?.error || err.message
        console.error(`[Calendar] createShiftEvent failed for staff ${staff._id}:`, detail)
        return null
    }
}

/**
 * Deletes a previously created Google Calendar event when the roster shift is removed.
 *
 * No-ops silently if the staff member has no tokens or if eventId is falsy, so callers
 * do not need to guard against missing calendar data before calling this function.
 *
 * @param {Object} staff   - Mongoose Staff document with googleAccessToken / googleRefreshToken
 * @param {string} eventId - Google Calendar event id stored on the Shift document
 */
async function deleteShiftEvent(staff, eventId) {
    if (!staff.googleAccessToken || !eventId) return

    const auth = buildOAuth2Client(staff)
    const calendar = google.calendar({ version: 'v3', auth })

    try {
        await calendar.events.delete({ calendarId: 'primary', eventId })
        console.log(`[Calendar] Event ${eventId} deleted for staff ${staff._id}`)
    } catch (err) {
        const detail = err.response?.data?.error || err.message
        console.error(`[Calendar] deleteShiftEvent failed for staff ${staff._id}:`, detail)
    }
}

module.exports = { createShiftEvent, deleteShiftEvent }
