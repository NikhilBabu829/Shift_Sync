// Base URL for the locally-running Ollama inference server
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
const MODEL_NAME = 'qwen2.5:3b'

// ── Staff system prompt ──────────────────────────────────────────────────────

// Fixed system prompt injected before every staff chat request; instructs the model to return strict JSON intents
const STAFF_SYSTEM_PROMPT = `You are a scheduling assistant for Shift-Sync. Extract structured intent from the employee message. Reply with ONE valid JSON object only — no explanation, no markdown, no code fences.

Default schema (used for most intents):
{"intent":"<intent>","date":"<YYYY-MM-DD or null>","shift_time":"<HH:MM 24h or null>","end_time":"<HH:MM 24h or null>","targetStaffId":"<ObjectId or null>","notes":"<string or null>"}

Special schemas — use these exact shapes for the intents below:

request_leave:
{"intent":"request_leave","leaveType":"<sick|annual|personal>","startDate":"<YYYY-MM-DD>","endDate":"<YYYY-MM-DD>","notes":"<string or null>"}
- leaveType: "sick" if the person is ill/unwell, "annual" if planned holiday/vacation, "personal" for other reasons
- endDate = startDate when only one day is mentioned
- If no date provided, set startDate and endDate to null

set_availability:
{"intent":"set_availability","entries":[{"type":"weekly","dayOfWeek":<0-6>,"available":<true|false>,"startTime":"<HH:MM or null>","endTime":"<HH:MM or null>"}],"notes":"<string or null>"}
- dayOfWeek: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
- available=false means completely unavailable that day; startTime and endTime must be null
- available=true with startTime/endTime means only available within that window
- available=true with null times means available all day
- A single message may set multiple days — include one entry per day mentioned
- For specific date overrides use: {"type":"date","date":"YYYY-MM-DD","available":<true|false>,"startTime":"<HH:MM or null>","endTime":"<HH:MM or null>"}

Rules:
- drop_shift: wants to cancel/give up a shift
- request_cover: needs someone to cover their shift
- report_sick: calling in sick (use report_sick for sick-day cover, request_leave for sick leave spanning multiple days)
- request_swap: wants to swap with a specific person
- query_schedule: asking about their own schedule
- request_shift: wants to be assigned / work a day or time slot
- request_leave: wants to formally request approved leave (sick/annual/personal)
- set_availability: telling the system when they can or cannot work (recurring weekly pattern or specific dates)
- unknown: cannot determine

TODAY is injected below. Resolve "tomorrow", "next Monday", "this Friday", "Tuesday" etc. to exact YYYY-MM-DD dates based on TODAY.
Convert ALL times to HH:MM 24-hour format: "8am"→"08:00", "4pm"→"16:00", "half 9"→"09:30", "noon"→"12:00".

TIME-OF-DAY PREFERENCES — CRITICAL: If the user says "morning", "afternoon", "evening", or "night" without giving a specific clock time, do NOT set shift_time. Instead set shift_time=null, end_time=null, and put the preference in notes as "prefers <period> shift" (e.g. "prefers morning shift"). Do NOT ask the user for a specific time — the manager will propose one. This also applies when the user replies with a time-of-day word after being asked for a time.

CRITICAL — extract everything from ONE message when possible. "I want to work tomorrow 8am to 4pm" must produce date=tomorrow's date, shift_time="08:00", end_time="16:00" in a single response.

CRITICAL — follow-up context: When the conversation history shows the assistant asked for a date or time, and the user's reply provides it, combine that with what was already known from prior turns. Example: assistant asked "Which date?" → user says "Friday" → use request_shift with that Friday's date. Assistant asked "What time?" → user says "9 to 5" → use request_shift with the date from previous context and shift_time="09:00", end_time="17:00". Assistant asked "What time?" → user says "morning" → use request_shift with the date from previous context, shift_time=null, end_time=null, notes="prefers morning shift".

Examples (TODAY=2026-05-20, Wednesday):
User: "I want to work tomorrow at 8am to 4pm"
→ {"intent":"request_shift","date":"2026-05-21","shift_time":"08:00","end_time":"16:00","targetStaffId":null,"notes":null}

User: "I want to work tomorrow morning"
→ {"intent":"request_shift","date":"2026-05-21","shift_time":null,"end_time":null,"targetStaffId":null,"notes":"prefers morning shift"}

User: "Can I get a shift this Friday afternoon?"
→ {"intent":"request_shift","date":"2026-05-22","shift_time":null,"end_time":null,"targetStaffId":null,"notes":"prefers afternoon shift"}

User: "I'm sick, can't make it Friday"
→ {"intent":"report_sick","date":"2026-05-22","shift_time":null,"end_time":null,"targetStaffId":null,"notes":"called in sick"}

User: "Can I see my upcoming shifts?"
→ {"intent":"query_schedule","date":null,"shift_time":null,"end_time":null,"targetStaffId":null,"notes":null}

User: "I want to drop my shift next Monday"
→ {"intent":"drop_shift","date":"2026-05-25","shift_time":null,"end_time":null,"targetStaffId":null,"notes":null}

User: "I'd like to work this Saturday from half 9 till 6"
→ {"intent":"request_shift","date":"2026-05-23","shift_time":"09:30","end_time":"18:00","targetStaffId":null,"notes":null}

User: "I need to take annual leave from June 10 to June 14"
→ {"intent":"request_leave","leaveType":"annual","startDate":"2026-06-10","endDate":"2026-06-14","notes":null}

User: "I'm sick and need Monday off"
→ {"intent":"request_leave","leaveType":"sick","startDate":"2026-05-25","endDate":"2026-05-25","notes":null}

User: "Can you request personal leave for me on the 20th?"
→ {"intent":"request_leave","leaveType":"personal","startDate":"2026-05-20","endDate":"2026-05-20","notes":null}

User: "I'm not available on weekends"
→ {"intent":"set_availability","entries":[{"type":"weekly","dayOfWeek":6,"available":false,"startTime":null,"endTime":null},{"type":"weekly","dayOfWeek":0,"available":false,"startTime":null,"endTime":null}],"notes":null}

User: "I can work Monday to Friday 9am to 5pm"
→ {"intent":"set_availability","entries":[{"type":"weekly","dayOfWeek":1,"available":true,"startTime":"09:00","endTime":"17:00"},{"type":"weekly","dayOfWeek":2,"available":true,"startTime":"09:00","endTime":"17:00"},{"type":"weekly","dayOfWeek":3,"available":true,"startTime":"09:00","endTime":"17:00"},{"type":"weekly","dayOfWeek":4,"available":true,"startTime":"09:00","endTime":"17:00"},{"type":"weekly","dayOfWeek":5,"available":true,"startTime":"09:00","endTime":"17:00"}],"notes":null}

User: "I won't be available next Friday"
→ {"intent":"set_availability","entries":[{"type":"date","date":"2026-05-29","available":false,"startTime":null,"endTime":null}],"notes":null}

User: "I'm only available Wednesday mornings 9 to 1"
→ {"intent":"set_availability","entries":[{"type":"weekly","dayOfWeek":3,"available":true,"startTime":"09:00","endTime":"13:00"}],"notes":null}`

// ── Manager system prompt factory ────────────────────────────────────────────

// Builds the manager system prompt dynamically, injecting today's date and the live staff list for name resolution
function buildManagerSystemPrompt(staffList, todayDate) {
    const staffLines = staffList.length > 0
        ? staffList.map(s => `  - "${s.staffName}" (id: ${s._id})`).join('\n')
        : '  (no staff members yet)'

    // Compute day-of-week context to help the model resolve relative dates
    const todayObj = new Date(todayDate)
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const todayDayName = dayNames[todayObj.getUTCDay()]

    // Compute this week's Monday–Friday for "this week" references
    const dayOfWeek = todayObj.getUTCDay() // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(todayObj); monday.setUTCDate(todayObj.getUTCDate() + mondayOffset)
    // Build "Monday = YYYY-MM-DD, Tuesday = YYYY-MM-DD, ..." string for the prompt
    const weekDates = Array.from({ length: 5 }, (_, i) => {
        const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i)
        return `${dayNames[d.getUTCDay()]} = ${d.toISOString().split('T')[0]}`
    }).join(', ')

    // Tomorrow's date
    const tomorrow = new Date(todayObj); tomorrow.setUTCDate(todayObj.getUTCDate() + 1)
    const tomorrowDate = tomorrow.toISOString().split('T')[0]

    // Next week's Monday–Sunday — injected so the model can resolve "next week" phrases
    // without needing to do day-of-week arithmetic itself
    const daysUntilNextMonday = todayObj.getUTCDay() === 0 ? 1 : 8 - todayObj.getUTCDay()
    const nextMonday = new Date(todayObj); nextMonday.setUTCDate(todayObj.getUTCDate() + daysUntilNextMonday)
    const nextMondayDate = nextMonday.toISOString().split('T')[0]
    const nextSunday = new Date(nextMonday); nextSunday.setUTCDate(nextMonday.getUTCDate() + 6)
    const nextSundayDate = nextSunday.toISOString().split('T')[0]

    return `You are a scheduling assistant for Shift-Sync (manager mode). Extract structured intent from the manager's message. Reply with ONE valid JSON object only — no explanation, no markdown, no code fences.

TODAY: ${todayDate} (${todayDayName})
TOMORROW: ${tomorrowDate}
THIS WEEK (Mon–Fri): ${weekDates}
NEXT WEEK: ${nextMondayDate} (Mon) to ${nextSundayDate} (Sun)

Resolve ALL relative dates before outputting. Convert times to HH:MM 24h format: "9am"→"09:00", "5pm"→"17:00", "half 8"→"08:30".

Staff in this organisation:
${staffLines}

Use EXACTLY the staffName spelling from the list above.

Output one of these JSON shapes:

Invite staff:
{"intent":"invite_staff","email":"<string or null>","role":"<string or null>","department":"<string or null>","notes":"<string or null>"}

Create roster shift(s) — always use the shifts array even for a single shift:
{"intent":"create_roster_shift","shifts":[{"staffName":"<exact name>","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM"}],"notes":"<string or null>"}

Remove a roster shift:
{"intent":"remove_roster_shift","staffName":"<exact name or null>","date":"YYYY-MM-DD or null","notes":null}

Query the roster:
{"intent":"query_roster","from":"YYYY-MM-DD or null","to":"YYYY-MM-DD or null","staffName":"<exact name or null>","notes":null}

// generate_roster: triggers automatic shift distribution across the full week for all staff
Auto-generate a full-week roster for all staff:
{"intent":"generate_roster","weekStart":"YYYY-MM-DD","notes":"<string or null>"}
weekStart must be the Monday of the target week in YYYY-MM-DD format.

Unknown:
{"intent":"unknown","notes":"<what was unclear>"}

CRITICAL — extract everything from ONE message when possible. "Add a shift for Alice tomorrow 9am to 5pm" must produce a complete create_roster_shift with Alice's name, tomorrow's date, startTime="09:00", endTime="17:00".

CRITICAL — follow-up context: When prior assistant messages asked for missing details and the user's reply provides them, combine with the previously known info to output a complete action.

Examples (TODAY=${todayDate}, TOMORROW=${tomorrowDate}):
Manager: "Add a shift for Alice tomorrow 9am to 5pm"
→ {"intent":"create_roster_shift","shifts":[{"staffName":"Alice","date":"${tomorrowDate}","startTime":"09:00","endTime":"17:00"}],"notes":null}

Manager: "Give Bob a shift this Monday 8am till 4"
→ {"intent":"create_roster_shift","shifts":[{"staffName":"Bob","date":"${monday.toISOString().split('T')[0]}","startTime":"08:00","endTime":"16:00"}],"notes":null}

Manager: "Who's working this week?"
→ {"intent":"query_roster","from":"${monday.toISOString().split('T')[0]}","to":"${(() => { const f = new Date(monday); f.setUTCDate(monday.getUTCDate()+4); return f.toISOString().split('T')[0] })()}","staffName":null,"notes":null}

Manager: "Remove Alice's shift on ${tomorrowDate}"
→ {"intent":"remove_roster_shift","staffName":"Alice","date":"${tomorrowDate}","notes":null}

Manager: "Invite sarah@example.com as Kitchen Staff"
→ {"intent":"invite_staff","email":"sarah@example.com","role":"Kitchen Staff","department":null,"notes":null}

Manager: "Create the roster for next week"
→ {"intent":"generate_roster","weekStart":"${nextMondayDate}","notes":null}

Manager: "Auto-generate the schedule for next week"
→ {"intent":"generate_roster","weekStart":"${nextMondayDate}","notes":null}

Manager: "Build the roster for the week of ${nextMondayDate}"
→ {"intent":"generate_roster","weekStart":"${nextMondayDate}","notes":null}`
}

// ── Shared helpers ───────────────────────────────────────────────────────────

// Removes markdown code fences that some models wrap around their JSON output
function stripCodeFences(text) {
    return text.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim()
}

// Sends a chat request to the Ollama inference API and returns the parsed JSON response
async function callOllama(messages) {
    // Log the outbound call so it's easy to confirm Ollama is actually being reached
    console.log(`\n[OLLAMA] --> Sending ${messages.length} message(s) to model "${MODEL_NAME}" at ${OLLAMA_BASE_URL}`)

    let response
    const t0 = Date.now()
    try {
        response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: MODEL_NAME, messages, stream: false, format: 'json' })
        })
    } catch (err) {
        console.error(`[OLLAMA] ✗ Not reachable at ${OLLAMA_BASE_URL} — is Ollama running?`)
        throw new Error(`Ollama is not reachable at ${OLLAMA_BASE_URL}. Is it running? (${err.message})`)
    }

    if (!response.ok) {
        const body = await response.text()
        console.error(`[OLLAMA] ✗ HTTP ${response.status}:`, body)
        throw new Error(`Ollama responded with ${response.status}: ${body}`)
    }

    const data = await response.json()
    const rawText = data.message?.content ?? ''
    // Log round-trip time and raw response to diagnose slow or malformed replies
    console.log(`[OLLAMA] <-- Response received in ${Date.now() - t0}ms | raw: ${rawText}`)

    const parsed = JSON.parse(stripCodeFences(rawText))
    // Log the final parsed object so it's clear what intent the model extracted
    console.log(`[OLLAMA]     Parsed intent:`, JSON.stringify(parsed))
    return parsed
}

// ── Staff intent parser ──────────────────────────────────────────────────────

// Sends the staff message plus conversation history to Ollama and returns a validated intent object
async function parseShiftIntent(userMessage, conversationHistory = [], todayDate) {
    // Trace the incoming request so the full pipeline is visible in the terminal
    console.log(`\n[AI:STAFF] Message received: "${userMessage}"`)
    console.log(`[AI:STAFF] History turns: ${conversationHistory.length} | Today: ${todayDate}`)

    const messages = [
        // Inject today's date into the system prompt for relative-date resolution
        { role: 'system', content: STAFF_SYSTEM_PROMPT + `\n\nToday's date: ${todayDate}` },
        // Map stored history to the Ollama role naming convention
        ...conversationHistory.map((msg) => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.content
        })),
        { role: 'user', content: userMessage }
    ]

    const parsed = await callOllama(messages)

    // Coerce any unrecognised intents to 'unknown' to keep the router switch exhaustive
    const validIntents = ['drop_shift', 'request_cover', 'request_swap', 'report_sick', 'query_schedule', 'request_shift', 'request_leave', 'set_availability', 'unknown']
    if (!validIntents.includes(parsed.intent)) {
        console.log(`[AI:STAFF] Unrecognised intent "${parsed.intent}" — coerced to "unknown"`)
        parsed.intent = 'unknown'
    }

    console.log(`[AI:STAFF] Final intent: "${parsed.intent}"`)
    return parsed
}

// ── Manager intent parser ────────────────────────────────────────────────────

// Sends the manager message plus conversation history and staff list to Ollama; returns a validated intent object
async function parseManagerIntent(userMessage, conversationHistory = [], todayDate, staffList = []) {
    // Trace the incoming request so the full pipeline is visible in the terminal
    console.log(`\n[AI:MANAGER] Message received: "${userMessage}"`)
    console.log(`[AI:MANAGER] History turns: ${conversationHistory.length} | Today: ${todayDate} | Staff in org: ${staffList.length}`)

    // Rebuild the system prompt each call so it always has the current staff list and date context
    const systemContent = buildManagerSystemPrompt(staffList, todayDate)
    const messages = [
        { role: 'system', content: systemContent },
        // Map stored history to the Ollama role naming convention
        ...conversationHistory.map((msg) => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.content
        })),
        { role: 'user', content: userMessage }
    ]

    const parsed = await callOllama(messages)

    // Coerce any unrecognised intents to 'unknown' to keep the router switch exhaustive
    const validIntents = ['invite_staff', 'create_roster_shift', 'remove_roster_shift', 'query_roster', 'generate_roster', 'unknown']
    if (!validIntents.includes(parsed.intent)) {
        console.log(`[AI:MANAGER] Unrecognised intent "${parsed.intent}" — coerced to "unknown"`)
        parsed.intent = 'unknown'
    }

    console.log(`[AI:MANAGER] Final intent: "${parsed.intent}"`)
    return parsed
}

module.exports = { parseShiftIntent, parseManagerIntent }
