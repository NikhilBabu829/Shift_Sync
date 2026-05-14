const asyncHandler = require('express-async-handler')
const ChatSession = require('../models/chatSession')
const { parseShiftIntent } = require('../services/geminiService')
const { routeIntent } = require('../services/intentRouter')

const MAX_MESSAGE_LENGTH = 500
const MAX_HISTORY_TURNS = 10  // keep last 10 exchanges to avoid ballooning Gemini context

exports.handleChat = asyncHandler(async (req, res) => {
    const { message } = req.body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message : 'A non-empty message is required.' })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ message : `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.` })
    }

    const staffId = req.user.id
    const todayDate = new Date().toISOString().split('T')[0]

    // Load or create a chat session for this staff member
    let session = await ChatSession.findOne({ staffMember : staffId, resolvedAt : null })
    if (!session) {
        session = new ChatSession({ staffMember : staffId, messages : [] })
    }

    // Keep only the last N turns to avoid blowing up the Gemini context
    const recentHistory = session.messages.slice(-MAX_HISTORY_TURNS * 2)

    // Call Gemini to parse intent
    let parsedIntent
    try {
        parsedIntent = await parseShiftIntent(message.trim(), recentHistory, todayDate)
    } catch (err) {
        console.error('Gemini parse error:', err.message)
        return res.status(502).json({
            message : 'The AI service is temporarily unavailable. Please try again shortly.',
            error : err.message
        })
    }

    // Route the intent to a DB action
    const result = await routeIntent(parsedIntent, staffId)

    // Persist both sides of the conversation
    session.messages.push({ role : 'user', content : message.trim() })
    session.messages.push({ role : 'model', content : result.message })

    // If we reached a resolved intent (not unknown), close this session
    if (parsedIntent.intent !== 'unknown') {
        session.resolvedIntent = parsedIntent.intent
        session.resolvedAt = new Date()
    }

    await session.save()

    return res.status(200).json({
        intent : parsedIntent,
        result,
        sessionId : session._id
    })
})
