/**
 * Seed script — populates Shift Sync with realistic sample data.
 * Run:     node seed.js
 * Re-run safe: skips records that already exist (matched by staff + date).
 */

require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const Manager      = require('./models/manager')
const Staff        = require('./models/staff')
const Shift        = require('./models/shift')
const ClockIn      = require('./models/clockIn')
const ClockOut     = require('./models/clockOut')
const ShiftRequest = require('./models/shiftRequest')

const MONGO_URI = `mongodb+srv://${process.env.MONGODB_URI}`

// ── helpers ────────────────────────────────────────────────────────────────

/** Date N days from today (time zeroed). */
function dayOffset(n) {
    const d = new Date()
    d.setDate(d.getDate() + n)
    d.setHours(0, 0, 0, 0)
    return d
}

/** ISO string like "2026-05-15" — used for Shift.date (past/future shifts). */
function isoDate(n) {
    return dayOffset(n).toISOString().split('T')[0]
}

/** "Thu May 15 2026" — used for ClockIn.dateClockedIn (must match JS toDateString). */
function dateStr(n) {
    return dayOffset(n).toDateString()
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
}

// ── seed ───────────────────────────────────────────────────────────────────

async function seed() {
    await mongoose.connect(MONGO_URI)
    console.log('Connected to MongoDB\n')

    // ── 1. Manager ────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('password123', 10)
    let manager = await Manager.findOne({ email: 'manager@shiftsync.dev' })
    if (!manager) {
        manager = await Manager.create({
            first_name     : 'Alex',
            last_name      : 'Morgan',
            email          : 'manager@shiftsync.dev',
            password       : passwordHash,
            manager        : true,
            org_name       : 'Shift Sync HQ',
            hq_coordinates : { lat: -33.8688, lng: 151.2093 }   // Sydney CBD
        })
        console.log('Created manager:', manager.email)
    } else {
        await Manager.updateOne({ _id: manager._id }, {
            $set: { hq_coordinates: { lat: -33.8688, lng: 151.2093 }, org_name: 'Shift Sync HQ' }
        })
        console.log('Manager OK:', manager.email)
    }

    // ── 2. Staff ──────────────────────────────────────────────────────────
    const staffData = [
        { staffName: 'Jamie Lee',      email: 'jamie@example.com',   role: 'Inventory Lead',     department: 'Operations',        google_id: 'seed_jamie_001'  },
        { staffName: 'Sam Rivera',     email: 'sam@example.com',     role: 'Shift Supervisor',   department: 'Operations',        google_id: 'seed_sam_002'    },
        { staffName: 'Casey Kim',      email: 'casey@example.com',   role: 'Front Desk',         department: 'Reception',         google_id: 'seed_casey_003'  },
        { staffName: 'Jordan Blake',   email: 'jordan@example.com',  role: 'Operations Analyst', department: 'Finance',           google_id: 'seed_jordan_004' },
        { staffName: 'Riley Chen',     email: 'riley@example.com',   role: 'Senior Associate',   department: 'HR',                google_id: 'seed_riley_005'  },
        { staffName: 'Priya Sharma',   email: 'priya@example.com',   role: 'Logistics Coord.',   department: 'Logistics',         google_id: 'seed_priya_006'  },
        // ── batch 2: cross-functional roles to broaden department coverage ──
        { staffName: 'Marcus Webb',    email: 'marcus@example.com',   role: 'Security Officer',    department: 'Security',    google_id: 'seed_marcus_007'  },
        { staffName: 'Aisha Okafor',   email: 'aisha@example.com',    role: 'Customer Support',    department: 'Support',     google_id: 'seed_aisha_008'   },
        { staffName: 'Lena Novak',     email: 'lena@example.com',     role: 'Data Analyst',        department: 'Analytics',   google_id: 'seed_lena_009'    },
        { staffName: 'Tom Nguyen',     email: 'tom@example.com',      role: 'Facilities Tech',     department: 'Facilities',  google_id: 'seed_tom_010'     },
        { staffName: 'Sophie Laurent', email: 'sophie@example.com',   role: 'Marketing Exec',      department: 'Marketing',   google_id: 'seed_sophie_011'  },
        // ── batch 3: expanded to 20 staff total; covers IT, Finance, and remaining gaps ──
        { staffName: 'Ethan Brooks',   email: 'ethan@example.com',    role: 'Junior Associate',    department: 'Operations',  google_id: 'seed_ethan_012'   },
        { staffName: 'Nadia Hassan',   email: 'nadia@example.com',    role: 'HR Coordinator',      department: 'HR',          google_id: 'seed_nadia_013'   },
        { staffName: 'Carlos Reyes',   email: 'carlos@example.com',   role: 'Warehouse Operative', department: 'Logistics',   google_id: 'seed_carlos_014'  },
        { staffName: 'Mei Zhang',      email: 'mei@example.com',      role: 'Finance Officer',     department: 'Finance',     google_id: 'seed_mei_015'     },
        { staffName: 'Owen Fletcher',  email: 'owen@example.com',     role: 'IT Support',          department: 'IT',          google_id: 'seed_owen_016'    },
        { staffName: 'Zara Patel',     email: 'zara@example.com',     role: 'Receptionist',        department: 'Reception',   google_id: 'seed_zara_017'    },
        { staffName: 'Daniel Osei',    email: 'daniel@example.com',   role: 'Security Guard',      department: 'Security',    google_id: 'seed_daniel_018'  },
        { staffName: 'Isabel Torres',  email: 'isabel@example.com',   role: 'Content Strategist',  department: 'Marketing',   google_id: 'seed_isabel_019'  },
        { staffName: 'Raj Kapoor',     email: 'raj@example.com',      role: 'Business Analyst',    department: 'Analytics',   google_id: 'seed_raj_020'     },
    ]

    const staffMembers = []
    for (const s of staffData) {
        let doc = await Staff.findOne({ email: s.email })
        if (!doc) {
            doc = await Staff.create({
                ...s,
                profile_picture: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(s.staffName)}`
            })
            console.log('Created staff:', doc.staffName)
        } else {
            console.log('Staff OK:     ', doc.staffName)
        }
        staffMembers.push(doc)
    }
    const [jamie, sam, casey, jordan, riley, priya, marcus, aisha, lena, tom, sophie,
           ethan, nadia, carlos, mei, owen, zara, daniel, isabel, raj] = staffMembers
    console.log()

    // ── 3. Clock-in / Clock-out — last 7 days + today ────────────────────
    // Each call creates one clock-in + clock-out pair for a staff member on a given day.
    // The HQ coords are used as the GPS location (within the geo-fence).
    const HQ_LAT = -33.8688, HQ_LNG = 151.2093

    const SHIFTS = [
        { start: 7,  end: 15, label: '7:00',  endLabel: '15:30' },
        { start: 8,  end: 16, label: '8:00',  endLabel: '16:30' },
        { start: 10, end: 18, label: '10:00', endLabel: '18:30' },
        { start: 13, end: 21, label: '13:30', endLabel: '22:00' },
        { start: 16, end: 23, label: '16:00', endLabel: '00:30' },
    ]

    // Plan: (staff, offsetDay, shiftIdx, isLate)
    // Covering every day from -6 to 0 (today) to populate the 7-day chart.
    const attendancePlan = [
        // day -6
        { staff: jamie,  day: -6, shift: 0, late: false },
        { staff: sam,    day: -6, shift: 2, late: false },
        { staff: casey,  day: -6, shift: 1, late: true  },
        { staff: riley,  day: -6, shift: 3, late: false },

        // day -5
        { staff: jamie,  day: -5, shift: 0, late: false },
        { staff: sam,    day: -5, shift: 2, late: false },
        { staff: jordan, day: -5, shift: 1, late: false },
        { staff: priya,  day: -5, shift: 4, late: false },

        // day -4
        { staff: jamie,  day: -4, shift: 0, late: true  },
        { staff: sam,    day: -4, shift: 2, late: false },
        { staff: casey,  day: -4, shift: 1, late: false },

        // day -3
        { staff: jamie,  day: -3, shift: 0, late: false },
        { staff: sam,    day: -3, shift: 2, late: false },
        { staff: jordan, day: -3, shift: 1, late: true  },
        { staff: riley,  day: -3, shift: 3, late: false },
        { staff: priya,  day: -3, shift: 0, late: false },

        // day -2
        { staff: jamie,  day: -2, shift: 0, late: false },
        { staff: sam,    day: -2, shift: 2, late: false },
        { staff: casey,  day: -2, shift: 1, late: false },
        { staff: priya,  day: -2, shift: 4, late: false },

        // day -1
        { staff: sam,    day: -1, shift: 2, late: false },
        { staff: casey,  day: -1, shift: 1, late: false },
        { staff: jordan, day: -1, shift: 3, late: false },
        { staff: riley,  day: -1, shift: 0, late: true  },

        // ── batch 2 attendance (marcus–sophie) ───────────────────────────────
        // day -6
        { staff: marcus, day: -6, shift: 4, late: false },
        { staff: aisha,  day: -6, shift: 1, late: false },

        // day -5
        { staff: marcus, day: -5, shift: 4, late: true  },
        { staff: lena,   day: -5, shift: 2, late: false },
        { staff: sophie, day: -5, shift: 0, late: false },

        // day -4
        { staff: aisha,  day: -4, shift: 1, late: false },
        { staff: tom,    day: -4, shift: 3, late: true  },
        { staff: lena,   day: -4, shift: 2, late: false },

        // day -3
        { staff: marcus, day: -3, shift: 4, late: false },
        { staff: sophie, day: -3, shift: 0, late: false },
        { staff: tom,    day: -3, shift: 3, late: false },

        // day -2
        { staff: aisha,  day: -2, shift: 1, late: true  },
        { staff: lena,   day: -2, shift: 2, late: false },
        { staff: tom,    day: -2, shift: 3, late: false },

        // day -1
        { staff: marcus, day: -1, shift: 4, late: false },
        { staff: sophie, day: -1, shift: 0, late: false },
        { staff: aisha,  day: -1, shift: 1, late: false },

        // ── batch 3 attendance (ethan–raj) ───────────────────────────────────
        // day -6
        { staff: ethan,  day: -6, shift: 1, late: false },
        { staff: nadia,  day: -6, shift: 2, late: true  },
        { staff: carlos, day: -6, shift: 3, late: false },
        { staff: zara,   day: -6, shift: 0, late: false },

        // day -5
        { staff: mei,    day: -5, shift: 1, late: false },
        { staff: owen,   day: -5, shift: 4, late: true  },
        { staff: daniel, day: -5, shift: 3, late: false },
        { staff: isabel, day: -5, shift: 0, late: false },

        // day -4
        { staff: ethan,  day: -4, shift: 1, late: true  },
        { staff: carlos, day: -4, shift: 3, late: false },
        { staff: raj,    day: -4, shift: 2, late: false },
        { staff: zara,   day: -4, shift: 0, late: false },

        // day -3
        { staff: nadia,  day: -3, shift: 2, late: false },
        { staff: mei,    day: -3, shift: 1, late: false },
        { staff: owen,   day: -3, shift: 4, late: false },
        { staff: isabel, day: -3, shift: 0, late: true  },

        // day -2
        { staff: ethan,  day: -2, shift: 1, late: false },
        { staff: carlos, day: -2, shift: 3, late: false },
        { staff: daniel, day: -2, shift: 3, late: true  },
        { staff: raj,    day: -2, shift: 2, late: false },

        // day -1
        { staff: nadia,  day: -1, shift: 2, late: false },
        { staff: mei,    day: -1, shift: 1, late: false },
        { staff: zara,   day: -1, shift: 0, late: true  },
        { staff: isabel, day: -1, shift: 0, late: false },

        // today (day 0) — shows up in Today's Ledger
        { staff: jamie,  day:  0, shift: 0, late: false },
        { staff: sam,    day:  0, shift: 2, late: false },
        { staff: casey,  day:  0, shift: 1, late: true  },
        { staff: jordan, day:  0, shift: 3, late: false },
        { staff: marcus, day:  0, shift: 4, late: false },
        { staff: lena,   day:  0, shift: 2, late: false },
        { staff: sophie, day:  0, shift: 0, late: true  },
        { staff: ethan,  day:  0, shift: 1, late: false },
        { staff: owen,   day:  0, shift: 4, late: false },
        { staff: raj,    day:  0, shift: 2, late: false },
    ]

    let clockCreated = 0
    for (const plan of attendancePlan) {
        const date = dateStr(plan.day)
        const existing = await ClockIn.findOne({ staffMember: plan.staff._id, dateClockedIn: date })
        if (existing) continue

        const sh = SHIFTS[plan.shift]
        const lateMin  = plan.late ? Math.floor(Math.random() * 20) + 5 : 0  // 5–25 min late
        const earlyMin = plan.late ? 0 : Math.floor(Math.random() * 8)        // 0–8 min early

        const clockInDate = dayOffset(plan.day)
        clockInDate.setHours(sh.start, lateMin - earlyMin, 0, 0)
        const clockOutDate = dayOffset(plan.day)
        clockOutDate.setHours(sh.end, Math.floor(Math.random() * 20), 0, 0)
        if (clockOutDate <= clockInDate) clockOutDate.setDate(clockOutDate.getDate() + 1)

        const coords = Array.from({ length: 3 }, (_, i) => ({
            lat:       HQ_LAT + (Math.random() - 0.5) * 0.0002,
            lng:       HQ_LNG + (Math.random() - 0.5) * 0.0002,
            timestamp: clockInDate.getTime() - (2 - i) * 1500
        }))

        const ci = await ClockIn.create({
            staffMember:      plan.staff._id,
            startOfShift:     sh.label,
            endOfShift:       sh.endLabel,
            timeClockedIn:    clockInDate.toLocaleTimeString(),
            dateClockedIn:    date,
            isLate:           plan.late,
            gpsCoordinates:   coords,
            gpsFlags:         { isDriveByPunch: false, isSpoofedGPS: false, velocityMph: 0 },
            faceVerification: { registered: false, isVerified: null, distance: null }
        })

        // Clock-out: only for past days. Today's staff stay "active" (no clock-out yet).
        if (plan.day < 0) {
            const co = await ClockOut.create({
                staffMember:   plan.staff._id,
                clockInRecord: ci._id,
                startOfShift:  sh.label,
                endOfShift:    sh.endLabel,
                timeClockedOut: clockOutDate.toLocaleTimeString(),
                dateClockedOut: clockOutDate.toDateString(),
                isLate:        false
            })
            await Staff.updateOne({ _id: plan.staff._id }, {
                $addToSet: { clock_In_Details: ci._id, clockOutDetails: co._id }
            })
        } else {
            await Staff.updateOne({ _id: plan.staff._id }, {
                $addToSet: { clock_In_Details: ci._id }
            })
        }
        clockCreated++
    }
    console.log(`Clock records: ${clockCreated} new pairs created`)

    // ── 4. Weekly roster shifts ───────────────────────────────────────────
    // Clean previous seed roster entries, then recreate
    await Shift.deleteMany({
        status: 'filled',
        swap_belongs_to: { $exists: false },
        date: { $in: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] }
    })

    const rosterEntries = [
        { staff: jamie,  day: 'Monday',    shift: SHIFTS[0] },
        { staff: sam,    day: 'Monday',    shift: SHIFTS[2] },
        { staff: casey,  day: 'Tuesday',   shift: SHIFTS[1] },
        { staff: jordan, day: 'Tuesday',   shift: SHIFTS[4] },
        { staff: riley,  day: 'Wednesday', shift: SHIFTS[0] },
        { staff: priya,  day: 'Wednesday', shift: SHIFTS[3] },
        { staff: jamie,  day: 'Thursday',  shift: SHIFTS[2] },
        { staff: sam,    day: 'Thursday',  shift: SHIFTS[1] },
        { staff: casey,  day: 'Friday',    shift: SHIFTS[0] },
        { staff: jordan, day: 'Friday',    shift: SHIFTS[2] },
        { staff: priya,  day: 'Saturday',  shift: SHIFTS[1] },
        { staff: riley,  day: 'Sunday',    shift: SHIFTS[3] },
        // ── batch 2 roster (marcus–sophie): security, support, analytics, facilities, marketing ──
        { staff: marcus, day: 'Monday',    shift: SHIFTS[4] },
        { staff: aisha,  day: 'Tuesday',   shift: SHIFTS[1] },
        { staff: lena,   day: 'Wednesday', shift: SHIFTS[2] },
        { staff: tom,    day: 'Thursday',  shift: SHIFTS[3] },
        { staff: sophie, day: 'Friday',    shift: SHIFTS[0] },
        { staff: marcus, day: 'Saturday',  shift: SHIFTS[4] },
        { staff: aisha,  day: 'Sunday',    shift: SHIFTS[2] },
        { staff: lena,   day: 'Monday',    shift: SHIFTS[1] },
        { staff: tom,    day: 'Tuesday',   shift: SHIFTS[0] },
        { staff: sophie, day: 'Wednesday', shift: SHIFTS[3] },
        // ── batch 3 roster (ethan–raj): operations, HR, logistics, finance, IT, reception, security, marketing, analytics ──
        // Two shifts per person ensures full-week coverage without leaving any day empty
        { staff: ethan,  day: 'Monday',    shift: SHIFTS[1] },
        { staff: nadia,  day: 'Tuesday',   shift: SHIFTS[2] },
        { staff: carlos, day: 'Wednesday', shift: SHIFTS[3] },
        { staff: mei,    day: 'Thursday',  shift: SHIFTS[1] },
        { staff: owen,   day: 'Friday',    shift: SHIFTS[4] },
        { staff: zara,   day: 'Saturday',  shift: SHIFTS[0] },
        { staff: daniel, day: 'Sunday',    shift: SHIFTS[3] },
        { staff: isabel, day: 'Monday',    shift: SHIFTS[0] },
        { staff: raj,    day: 'Tuesday',   shift: SHIFTS[2] },
        { staff: ethan,  day: 'Thursday',  shift: SHIFTS[3] },
        { staff: nadia,  day: 'Friday',    shift: SHIFTS[1] },
        { staff: carlos, day: 'Saturday',  shift: SHIFTS[2] },
        { staff: mei,    day: 'Sunday',    shift: SHIFTS[0] },
        { staff: owen,   day: 'Wednesday', shift: SHIFTS[1] },
        { staff: daniel, day: 'Thursday',  shift: SHIFTS[4] },
        { staff: isabel, day: 'Saturday',  shift: SHIFTS[2] },
        { staff: raj,    day: 'Sunday',    shift: SHIFTS[1] },
        { staff: zara,   day: 'Wednesday', shift: SHIFTS[0] },
    ]

    for (const r of rosterEntries) {
        await Shift.create({
            belongs_to:       r.staff._id,
            date:             r.day,
            shift_start_time: r.shift.label,
            shift_end_time:   r.shift.endLabel,
            status:           'filled',
        })
    }
    console.log(`Roster:        ${rosterEntries.length} shifts created`)

    // ── 5. Pending swap requests ──────────────────────────────────────────
    // Remove old seed swaps (identified by their date strings) then recreate
    await Shift.deleteMany({
        status: 'pending_swap',
        date: { $in: [isoDate(5), isoDate(3), isoDate(4)] }
    })

    const swapRequests = [
        {
            belongs_to:            riley._id,
            date:                  isoDate(5),
            shift_start_time:      '7:00',
            shift_end_time:        '15:30',
            swapDate:              isoDate(6),
            swap_belongs_to:       sam._id,
            swap_shift_start_time: '10:00',
            swap_shift_end_time:   '18:30',
            status:                'pending_swap',
        },
        {
            belongs_to:            casey._id,
            date:                  isoDate(3),
            shift_start_time:      '8:00',
            shift_end_time:        '16:30',
            swapDate:              isoDate(4),
            swap_belongs_to:       jordan._id,
            swap_shift_start_time: '13:30',
            swap_shift_end_time:   '22:00',
            status:                'pending_swap',
        },
        {
            belongs_to:            priya._id,
            date:                  isoDate(4),
            shift_start_time:      '16:00',
            shift_end_time:        '00:30',
            swapDate:              isoDate(5),
            swap_belongs_to:       jamie._id,
            swap_shift_start_time: '7:00',
            swap_shift_end_time:   '15:30',
            status:                'pending_swap',
        },
        // ── batch 3 swap requests (ethan↔nadia, carlos↔raj) ─────────────────
        {
            belongs_to:            ethan._id,
            date:                  isoDate(2),
            shift_start_time:      '8:00',
            shift_end_time:        '16:30',
            swapDate:              isoDate(3),
            swap_belongs_to:       nadia._id,
            swap_shift_start_time: '10:00',
            swap_shift_end_time:   '18:30',
            status:                'pending_swap',
        },
        {
            belongs_to:            carlos._id,
            date:                  isoDate(5),
            shift_start_time:      '13:30',
            shift_end_time:        '22:00',
            swapDate:              isoDate(6),
            swap_belongs_to:       raj._id,
            swap_shift_start_time: '10:00',
            swap_shift_end_time:   '18:30',
            status:                'pending_swap',
        },
        // ── batch 2 swap requests (marcus↔aisha, lena↔sophie) ───────────────
        {
            belongs_to:            marcus._id,
            date:                  isoDate(2),
            shift_start_time:      '16:00',
            shift_end_time:        '00:30',
            swapDate:              isoDate(3),
            swap_belongs_to:       aisha._id,
            swap_shift_start_time: '8:00',
            swap_shift_end_time:   '16:30',
            status:                'pending_swap',
        },
        {
            belongs_to:            lena._id,
            date:                  isoDate(6),
            shift_start_time:      '10:00',
            shift_end_time:        '18:30',
            swapDate:              isoDate(7),
            swap_belongs_to:       sophie._id,
            swap_shift_start_time: '7:00',
            swap_shift_end_time:   '15:30',
            status:                'pending_swap',
        },
    ]

    for (const s of swapRequests) {
        await Shift.create(s)
    }
    console.log(`Pending swaps: ${swapRequests.length} created`)

    // ── 6. Shift requests ─────────────────────────────────────────────────
    await ShiftRequest.deleteMany({
        requestedDate: { $in: [isoDate(1), isoDate(2), isoDate(3), isoDate(4), isoDate(7), isoDate(8), isoDate(9), isoDate(10)] }
    })

    const shiftRequests = [
        // ── batch 2 shift requests (tom, aisha, marcus, sophie, lena) ────────
        { staffMember: tom._id,    requestedDate: isoDate(1),  requestedStartTime: '8:00',  requestedEndTime: '16:30', notes: 'Happy to cover any morning slot',  status: 'pending'  },
        { staffMember: aisha._id,  requestedDate: isoDate(2),  requestedStartTime: '10:00', requestedEndTime: '18:30', notes: null,                               status: 'pending'  },
        { staffMember: marcus._id, requestedDate: isoDate(3),  requestedStartTime: '16:00', requestedEndTime: '00:30', notes: 'Need late shift — prefer nights',   status: 'approved' },
        { staffMember: sophie._id, requestedDate: isoDate(7),  requestedStartTime: '7:00',  requestedEndTime: '15:30', notes: null,                               status: 'pending'  },
        { staffMember: lena._id,   requestedDate: isoDate(8),  requestedStartTime: '13:30', requestedEndTime: '22:00', notes: 'Flexible on timing if needed',      status: 'denied'   },
        // ── batch 3 shift requests (ethan–raj): spread across near-future dates ──
        { staffMember: ethan._id,  requestedDate: isoDate(1),  requestedStartTime: '8:00',  requestedEndTime: '16:30', notes: 'Available all day',                 status: 'pending'  },
        { staffMember: nadia._id,  requestedDate: isoDate(4),  requestedStartTime: '10:00', requestedEndTime: '18:30', notes: null,                               status: 'approved' },
        { staffMember: carlos._id, requestedDate: isoDate(2),  requestedStartTime: '7:00',  requestedEndTime: '15:30', notes: 'Prefer mornings',                   status: 'pending'  },
        { staffMember: mei._id,    requestedDate: isoDate(9),  requestedStartTime: '13:30', requestedEndTime: '22:00', notes: null,                               status: 'pending'  },
        { staffMember: owen._id,   requestedDate: isoDate(3),  requestedStartTime: '16:00', requestedEndTime: '00:30', notes: 'Evening slot works best for me',    status: 'denied'   },
        { staffMember: zara._id,   requestedDate: isoDate(7),  requestedStartTime: '8:00',  requestedEndTime: '16:30', notes: null,                               status: 'pending'  },
        { staffMember: daniel._id, requestedDate: isoDate(10), requestedStartTime: '16:00', requestedEndTime: '00:30', notes: 'Night security preferred',          status: 'pending'  },
        { staffMember: isabel._id, requestedDate: isoDate(4),  requestedStartTime: '10:00', requestedEndTime: '18:30', notes: 'Content deadlines allow this day',  status: 'approved' },
        { staffMember: raj._id,    requestedDate: isoDate(8),  requestedStartTime: '8:00',  requestedEndTime: '16:30', notes: null,                               status: 'pending'  },
    ]

    for (const r of shiftRequests) {
        await ShiftRequest.create(r)
    }
    console.log(`Shift requests: ${shiftRequests.length} created`)

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════')
    console.log('  Seed complete.')
    console.log('═══════════════════════════════════════')
    console.log('  Manager login:')
    console.log('    email:    manager@shiftsync.dev')
    console.log('    password: password123')
    console.log()
    console.log('  Staff members (Google OAuth — no password):')
    staffMembers.forEach(s => console.log(`    ${s.staffName.padEnd(16)} <${s.email}>`))
    console.log()
    console.log('  Today\'s Ledger:  10 staff clocked in (Jamie, Sam, Casey, Jordan, Marcus, Lena, Sophie, Ethan, Owen, Raj)')
    console.log('  Weekly chart:    data across all 7 days')
    console.log('  Roster:          40 shifts across the week')
    console.log('  Pending swaps:   7 awaiting manager approval')
    console.log('  Shift requests:  14 (mix of pending, approved, denied)')
    console.log('═══════════════════════════════════════')

    await mongoose.disconnect()
    process.exit(0)
}

seed().catch(err => {
    console.error('Seed failed:', err)
    process.exit(1)
})
