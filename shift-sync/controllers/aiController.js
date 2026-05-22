// Wraps async route handlers and forwards thrown errors to Express error handler
const asyncHandler = require('express-async-handler')
// Mongoose models for persisting AI conversation history
const ChatSession = require('../models/chatSession')
const ManagerChatSession = require('../models/managerChatSession')
const STAFF = require('../models/staff')
// NLP parsers that call the Ollama LLM and return structured intent objects
const { parseShiftIntent, parseManagerIntent } = require('../services/geminiService')
// Business-logic routers that translate intent objects into DB operations
const { routeIntent, routeManagerIntent } = require('../services/intentRouter')

// Maximum characters allowed per message to prevent abuse
const MAX_MESSAGE_LENGTH = 500
// Number of recent conversation turns fed to the LLM for context
const MAX_HISTORY_TURNS = 10

// ── Deterministic time parsing ───────────────────────────────────────────────

// Converts a single time word or phrase into HH:MM (24h). Returns null if unrecognised.
// Handles: "8am", "4pm", "08:30", "16:00", "half 9", "noon", "midnight", and bare numbers.
function parseSingleTime(str) {
    str = (str || '').trim().toLowerCase()
    if (!str) return null

    if (str === 'noon')     return '12:00'
    if (str === 'midnight') return '00:00'

    // "half 9" → "09:30"
    const halfMatch = str.match(/^half\s+(\d{1,2})$/)
    if (halfMatch) {
        const h = parseInt(halfMatch[1])
        return `${String(h).padStart(2, '0')}:30`
    }

    // "8am", "8 am", "8:30am", "08:30 am"
    const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
    if (ampmMatch) {
        let h = parseInt(ampmMatch[1])
        const m = parseInt(ampmMatch[2] || '0')
        const period = ampmMatch[3]
        if (period === 'pm' && h !== 12) h += 12
        if (period === 'am' && h === 12) h = 0
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }

    // "8:30" or "16:00"
    const colonMatch = str.match(/^(\d{1,2}):(\d{2})$/)
    if (colonMatch) {
        return `${String(parseInt(colonMatch[1])).padStart(2, '0')}:${colonMatch[2]}`
    }

    // Bare number like "8" or "16"
    const bareMatch = str.match(/^(\d{1,2})$/)
    if (bareMatch) {
        return `${String(parseInt(bareMatch[1])).padStart(2, '0')}:00`
    }

    return null
}

// Extracts a start/end time pair from a natural language string such as
// "8am to 4pm", "8:30 till 16:00", "9 – 5", "from 8 until 4",
// or even "the time I want is 8am to 4pm" (arbitrary surrounding text).
// Strategy: first try a clean split on separator words; if that yields no start time,
// fall back to pulling every time token out of the text via regex and using the first two.
// Returns { shift_time: "HH:MM"|null, end_time: "HH:MM"|null }.
function parseTimeFromText(text) {
    const norm = (text || '').toLowerCase().trim()
    const result = { shift_time: null, end_time: null }

    // ── Pass 1: split on separators ──────────────────────────────────────────
    // Only trust this result if the START token was recognisable; otherwise
    // the split landed on prose (e.g. "the time I want is 8am | to | 4pm")
    // and Pass 2's regex scan will do a better job.
    const stripped = norm.replace(/^from\s+/, '')
    const parts = stripped.split(/\s+(?:to|till|until|through|thru)\s+|\s*[-–]\s*/)

    if (parts.length >= 2) {
        const s = parseSingleTime(parts[0])
        const e = parseSingleTime(parts[parts.length - 1])
        if (s !== null) {
            result.shift_time = s
            result.end_time   = e
            return result
        }
    }

    // ── Pass 2: regex scan — pull every time token from the whole string ─────
    // Matches: "8am", "8:30pm", "16:00", "half 9", "noon", "midnight", bare ints 1-23
    const TOKEN_RE = /half\s+\d{1,2}|noon|midnight|\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)/g
    const tokens = (norm.match(TOKEN_RE) || []).map(t => parseSingleTime(t)).filter(Boolean)

    if (tokens.length >= 2) {
        result.shift_time = tokens[0]
        result.end_time   = tokens[tokens.length - 1]
    } else if (tokens.length === 1) {
        result.shift_time = tokens[0]
    }

    return result
}

// ── Context recovery ─────────────────────────────────────────────────────────

// Repairs the LLM's parsed intent when the small local model loses track of a
// mid-conversation state. Detects two failure modes:
//   1. Router asked for a time, LLM returned "unknown" or kept intent but dropped the date.
//   2. Router asked for a date, LLM returned "unknown" — re-surfaces the question.
// In both cases the missing fields are resolved from the conversation history + raw message,
// never from another LLM call.
function recoverStaffContext(parsedIntent, recentHistory, rawMessage) {
    const lastModelMsg = [...recentHistory].reverse().find(m => m.role === 'model')
    if (!lastModelMsg) return parsedIntent

    const lastContent = lastModelMsg.content

    // Case 1: router sent "What time would you like to start" — user replied with times or a time-of-day preference.
    // The LLM may have returned unknown (no context) or request_shift with no date (lost context).
    const askedForTime = lastContent.includes('What time would you like to start')
    if (askedForTime && (parsedIntent.intent === 'unknown' || (parsedIntent.intent === 'request_shift' && !parsedIntent.date))) {
        const dateMatch = lastContent.match(/(\d{4}-\d{2}-\d{2})/)
        const times     = parseTimeFromText(rawMessage)
        if (dateMatch && (times.shift_time || times.end_time)) {
            return { ...parsedIntent, intent: 'request_shift', date: dateMatch[1], shift_time: times.shift_time, end_time: times.end_time }
        }
        // User replied with a time-of-day preference (e.g. "morning") rather than a specific clock time
        const TOD_RE = /\b(morning|afternoon|evening|night)\b/i
        const todMatch = rawMessage.match(TOD_RE)
        if (dateMatch && todMatch) {
            return { ...parsedIntent, intent: 'request_shift', date: dateMatch[1], shift_time: null, end_time: null, notes: `prefers ${todMatch[1].toLowerCase()} shift` }
        }
    }

    // Case 2: router sent "Which date would you like to work" — LLM returned unknown.
    // Re-surface the request_shift intent with no date so the router asks again gracefully.
    const askedForDate = lastContent.includes('Which date would you like to work')
    if (askedForDate && parsedIntent.intent === 'unknown') {
        return { ...parsedIntent, intent: 'request_shift', date: null, shift_time: null, end_time: null }
    }

    return parsedIntent
}

// ── Staff chat ───────────────────────────────────────────────────────────────

// Handles a natural language message from a staff member, returns an intent result and updated session
exports.handleChat = asyncHandler(async (req, res) => {
    const { message } = req.body

    // Validate message presence and length before hitting the LLM
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: 'A non-empty message is required.' })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` })
    }

    const staffId = req.user.id
    // Today's date injected into the LLM prompt so relative dates resolve correctly
    const todayDate = new Date().toISOString().split('T')[0]

    // Load the staff member's open session or create a fresh one
    let session = await ChatSession.findOne({ staffMember: staffId, resolvedAt: null })
    if (!session) {
        session = new ChatSession({ staffMember: staffId, messages: [] })
    }

    // Slice the last N turns to keep the context window manageable
    const recentHistory = session.messages.slice(-MAX_HISTORY_TURNS * 2)

    let parsedIntent
    try {
        parsedIntent = await parseShiftIntent(message.trim(), recentHistory, todayDate)
    } catch (err) {
        console.error('Ollama parse error (staff):', err.message)
        return res.status(502).json({
            message: 'The AI service is temporarily unavailable. Please try again shortly.',
            error: err.message
        })
    }

    // Repair any fields the LLM dropped in a multi-turn follow-up before routing
    const beforeRecovery = parsedIntent.intent
    parsedIntent = recoverStaffContext(parsedIntent, recentHistory, message.trim())
    // Only log when recovery actually changed something — avoids noise on clean single-turn messages
    if (parsedIntent.intent !== beforeRecovery) {
        console.log(`[AI:STAFF] Context recovery changed intent: "${beforeRecovery}" -> "${parsedIntent.intent}"`)
    }

    // Execute the intent against the database and get a human-readable result message
    const result = await routeIntent(parsedIntent, staffId)

    // Confirm what the router decided and what message will be sent back to the staff member
    console.log(`[AI:STAFF] Router result: action="${result.action}" completed=${result.completed}`)
    console.log(`[AI:STAFF] Reply to user: "${result.message}"`)

    // Append both the user message and the AI reply to the persistent session history
    session.messages.push({ role: 'user', content: message.trim() })
    session.messages.push({ role: 'model', content: result.message })

    // Mark the session as resolved so a new one is created on the next intent
    if (result.completed === true) {
        session.resolvedIntent = parsedIntent.intent
        session.resolvedAt = new Date()
    }

    await session.save()

    return res.status(200).json({ intent: parsedIntent, result, sessionId: session._id })
})

// ── Manager chat ─────────────────────────────────────────────────────────────

// Handles a natural language message from a manager, returns an intent result and updated session
exports.handleManagerChat = asyncHandler(async (req, res) => {
    const { message } = req.body

    // Validate message presence and length before hitting the LLM
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: 'A non-empty message is required.' })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` })
    }

    const managerId = req.user.id
    // Today's date injected into the LLM prompt so relative dates resolve correctly
    const todayDate = new Date().toISOString().split('T')[0]

    // Fetch staff list to inject as context into the AI prompt
    const staffList = await STAFF.find({}).select('staffName _id').lean()

    // Load or create a manager chat session
    let session = await ManagerChatSession.findOne({ manager: managerId, resolvedAt: null })
    if (!session) {
        session = new ManagerChatSession({ manager: managerId, messages: [] })
    }

    // Slice the last N turns to keep the context window manageable
    const recentHistory = session.messages.slice(-MAX_HISTORY_TURNS * 2)

    // Extract the raw JWT token for signing invite tokens inside routeManagerIntent
    const authHeader = req.headers['authorization']
    const managerToken = authHeader && authHeader.split(' ')[1]

    let parsedIntent
    try {
        parsedIntent = await parseManagerIntent(message.trim(), recentHistory, todayDate, staffList)
    } catch (err) {
        console.error('Ollama parse error (manager):', err.message)
        return res.status(502).json({
            message: 'The AI service is temporarily unavailable. Please try again shortly.',
            error: err.message
        })
    }

    // Execute the manager intent against the database
    const result = await routeManagerIntent(parsedIntent, managerId, managerToken)

    // Confirm what the router decided and what message will be sent back to the manager
    console.log(`[AI:MANAGER] Router result: action="${result.action}" completed=${result.completed}`)
    console.log(`[AI:MANAGER] Reply to manager: "${result.message}"`)

    // Append both the user message and the AI reply to the persistent session history
    session.messages.push({ role: 'user', content: message.trim() })
    session.messages.push({ role: 'model', content: result.message })

    // Mark the session as resolved so a new one is created on the next intent
    if (result.completed === true) {
        session.resolvedIntent = parsedIntent.intent
        session.resolvedAt = new Date()
    }

    await session.save()

    return res.status(200).json({ intent: parsedIntent, result, sessionId: session._id })
})
