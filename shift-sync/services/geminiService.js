const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const MODEL_NAME = process.env.OLLAMA_MODEL || 'gemma3'

const SYSTEM_PROMPT = `You are a scheduling assistant for a shift management application called Shift-Sync.
Your only job is to extract structured intent from an employee's message.

Always reply with a single valid JSON object and absolutely nothing else — no explanation, no markdown, no code fences.

JSON schema to follow exactly:
{
  "intent": <one of: "drop_shift" | "request_cover" | "request_swap" | "report_sick" | "query_schedule" | "unknown">,
  "date": <"YYYY-MM-DD" or null>,
  "shift_time": <"HH:MM" in 24h format or null>,
  "targetStaffId": <MongoDB ObjectId string if a specific person is mentioned, otherwise null>,
  "notes": <any extra context worth passing on, or null>
}

Intent definitions:
- drop_shift: employee wants to give up / cancel a shift
- request_cover: employee needs someone to cover their shift
- report_sick: employee is calling in sick (treat as drop_shift + sickness note)
- request_swap: employee wants to swap their shift with a specific person
- query_schedule: employee is asking about their own schedule
- unknown: cannot determine intent

Today's date is injected at runtime. Resolve relative dates like "tomorrow", "Tuesday", "next Friday" to YYYY-MM-DD.`

/**
 * Strips markdown code fences that models sometimes add despite instructions.
 */
function stripCodeFences(text) {
    return text.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim()
}

/**
 * Calls a local Ollama model with the user's message and conversation history.
 * Returns a parsed intent object.
 * Throws if Ollama is unreachable or the response cannot be parsed as valid JSON.
 */
async function parseShiftIntent(userMessage, conversationHistory = [], todayDate) {
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT + `\n\nToday's date: ${todayDate}` },
        ...conversationHistory.map((msg) => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.content
        })),
        { role: 'user', content: userMessage }
    ]

    let response
    try {
        response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages,
                stream: false,
                format: 'json'   // forces Ollama to emit valid JSON
            })
        })
    } catch (err) {
        throw new Error(`Ollama is not reachable at ${OLLAMA_BASE_URL}. Is it running? (${err.message})`)
    }

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`Ollama responded with ${response.status}: ${body}`)
    }

    const data = await response.json()
    const rawText = data.message?.content ?? ''
    const cleaned = stripCodeFences(rawText)

    const parsed = JSON.parse(cleaned)

    const validIntents = ['drop_shift', 'request_cover', 'request_swap', 'report_sick', 'query_schedule', 'unknown']
    if (!validIntents.includes(parsed.intent)) {
        parsed.intent = 'unknown'
    }

    return parsed
}

module.exports = { parseShiftIntent }
