
// ---------------------------------------------------------------------------
// Shared design tokens — kept in sync with the frontend MUI theme
// ---------------------------------------------------------------------------
const C = {
  navy:       '#0f2a5c',   // nav bar / header background
  navyDark:   '#091e47',   // darker gradient stop
  blue:       '#2563eb',   // primary accent / CTA buttons
  blueLight:  '#eff6ff',   // table header rows / tinted sections
  blueMid:    '#bfdbfe',   // dividers / borders in tinted rows
  green:      '#16a34a',   // approved / agree states
  greenLight: '#f0fdf4',
  red:        '#dc2626',   // denied / error states
  redLight:   '#fff1f2',
  amber:      '#d97706',   // warning / revoked states
  amberLight: '#fffbeb',
  bodyBg:     '#f0f4f8',   // page background
  cardBg:     '#ffffff',
  text:       '#0f172a',   // primary body text
  textMuted:  '#64748b',   // secondary / footnote text
  border:     '#e2e8f0',
  footerBg:   '#f8fafc',
}

// ---------------------------------------------------------------------------
// Shared chrome: wraps every email in the same header + footer
// headerAccent: hex colour for the category pill shown in the header strip
// ---------------------------------------------------------------------------
function base(content, { subject = 'Shift Sync Notification', headerAccent = C.blue, badgeText = '', badgeColor = C.blue } = {}) {
  const badge = badgeText
    ? `<tr>
        <td align="center" style="padding:0 0 28px;">
          <span style="display:inline-block; background:${badgeColor}1a; color:${badgeColor};
                       font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase;
                       padding:5px 14px; border-radius:20px; border:1px solid ${badgeColor}33;">
            ${badgeText}
          </span>
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:${C.bodyBg}; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${C.bodyBg}; min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px 48px;">

        <!-- ── Email card ─────────────────────────────────────────── -->
        <table width="600" border="0" cellspacing="0" cellpadding="0"
               style="max-width:600px; width:100%; background:${C.cardBg};
                      border-radius:12px; overflow:hidden;
                      box-shadow:0 4px 24px rgba(15,42,92,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${C.navyDark} 0%,${C.navy} 100%);
                        padding:28px 36px 24px; border-bottom:3px solid ${headerAccent};">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <!-- Logo mark -->
                    <table border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background:${headerAccent}; border-radius:8px;
                                    width:36px; height:36px; text-align:center; vertical-align:middle;">
                          <span style="color:#fff; font-size:18px; font-weight:800; line-height:36px;">S</span>
                        </td>
                        <td style="padding-left:10px; vertical-align:middle;">
                          <span style="color:#ffffff; font-size:18px; font-weight:700; letter-spacing:0.3px;">Shift</span><span style="color:${headerAccent === C.blue ? '#93c5fd' : '#c7d2fe'}; font-size:18px; font-weight:700;"> Sync</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="color:rgba(255,255,255,0.45); font-size:11px; letter-spacing:0.5px;">WORKFORCE MANAGEMENT</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                ${badge}
                ${content}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${C.footerBg}; border-top:1px solid ${C.border};
                        padding:20px 36px; border-radius:0 0 12px 12px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="color:${C.textMuted}; font-size:12px; line-height:1.6;">
                    This is an automated message from <strong>Shift Sync</strong>. Please do not reply directly to this email.
                  </td>
                  <td align="right" style="white-space:nowrap; padding-left:16px;">
                    <span style="color:${C.textMuted}; font-size:11px;">© Shift Sync</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- ── /Email card ─────────────────────────────────────────── -->

      </td>
    </tr>
  </table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Small reusable HTML helpers
// ---------------------------------------------------------------------------

function heading(text) {
  return `<tr><td style="padding:0 0 8px;"><h1 style="margin:0; font-size:22px; font-weight:700; color:${C.text}; line-height:1.3;">${text}</h1></td></tr>`
}

function para(text, style = '') {
  return `<tr><td style="padding:0 0 16px; font-size:15px; color:${C.text}; line-height:1.6; ${style}">${text}</td></tr>`
}

function divider() {
  return `<tr><td style="padding:4px 0 20px;"><div style="border-top:1px solid ${C.border};"></div></td></tr>`
}

function sectionLabel(text) {
  return `<tr><td style="padding:0 0 10px; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:${C.textMuted};">${text}</td></tr>`
}

// Renders an array of { label, value, highlight? } rows as a clean detail card
function detailCard(rows) {
  const rowsHtml = rows.map(({ label, value, highlight }) => `
    <tr>
      <td style="padding:11px 16px; font-size:13px; font-weight:600; color:${C.textMuted};
                  background:${C.blueLight}; border-bottom:1px solid ${C.border}; width:38%; white-space:nowrap;">
        ${label}
      </td>
      <td style="padding:11px 16px; font-size:14px; color:${highlight || C.text};
                  font-weight:${highlight ? '600' : '400'};
                  background:${C.cardBg}; border-bottom:1px solid ${C.border};">
        ${value}
      </td>
    </tr>`).join('')

  return `<tr><td style="padding:0 0 24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0"
           style="border:1px solid ${C.border}; border-radius:8px; overflow:hidden; border-collapse:separate; border-spacing:0;">
      ${rowsHtml}
    </table>
  </td></tr>`
}

// Renders two columns for shift comparison tables
function swapTable(rows) {
  const header = `
    <tr style="background:${C.navy};">
      <th style="text-align:left; padding:11px 16px; font-size:12px; font-weight:600;
                  letter-spacing:0.5px; color:rgba(255,255,255,0.75); border-right:1px solid rgba(255,255,255,0.1);">
        STAFF MEMBER
      </th>
      <th style="text-align:left; padding:11px 16px; font-size:12px; font-weight:600;
                  letter-spacing:0.5px; color:rgba(255,255,255,0.75);">
        SHIFT
      </th>
    </tr>`

  const bodyRows = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? C.blueLight : C.cardBg};">
      <td style="padding:12px 16px; font-size:14px; color:${C.text}; font-weight:600;
                  border-right:1px solid ${C.border}; border-bottom:1px solid ${C.border}; vertical-align:top;">
        ${r.name}
      </td>
      <td style="padding:12px 16px; font-size:14px; color:${C.text};
                  border-bottom:1px solid ${C.border}; vertical-align:top; line-height:1.5;">
        ${r.shift}
      </td>
    </tr>`).join('')

  return `<tr><td style="padding:0 0 24px;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0"
           style="border:1px solid ${C.border}; border-radius:8px; overflow:hidden; border-collapse:separate; border-spacing:0;">
      ${header}${bodyRows}
    </table>
  </td></tr>`
}

function ctaButton(text, href, bg = C.blue) {
  return `<a href="${href}"
    style="display:inline-block; background:${bg}; color:#ffffff; text-decoration:none;
           padding:13px 28px; border-radius:8px; font-size:14px; font-weight:600;
           letter-spacing:0.2px; line-height:1;">
    ${text}
  </a>`
}

function stepList(items) {
  const liHtml = items.map(item => `
    <tr>
      <td style="padding:5px 0; vertical-align:top; width:20px;">
        <span style="display:inline-block; width:6px; height:6px; border-radius:50%;
                      background:${C.blue}; margin-top:7px;"></span>
      </td>
      <td style="padding:5px 0 5px 10px; font-size:14px; color:${C.text}; line-height:1.5;">
        ${item}
      </td>
    </tr>`).join('')

  return `<tr><td style="padding:0 0 24px;">
    <table border="0" cellspacing="0" cellpadding="0">${liHtml}</table>
  </td></tr>`
}

function infoBox(text, bg = C.blueLight, borderColor = C.blue) {
  return `<tr><td style="padding:0 0 24px;">
    <div style="background:${bg}; border-left:3px solid ${borderColor}; border-radius:0 6px 6px 0;
                 padding:14px 16px; font-size:13px; color:${C.text}; line-height:1.5;">
      ${text}
    </div>
  </td></tr>`
}

// ---------------------------------------------------------------------------
// 1. Invite email
// ---------------------------------------------------------------------------
function sendingToken(token) {
  const content = `
    ${heading('You\'ve been invited to join Shift Sync')}
    ${para(`Your manager has invited you to join their team on <strong>Shift Sync</strong> — the workforce management platform that keeps your schedule, swaps, and clock-ins all in one place.`)}
    ${para('Click the button below to accept the invitation and set up your account. The link is valid for <strong>24 hours</strong>.', `color:${C.textMuted}; font-size:14px;`)}
    <tr>
      <td align="center" style="padding:8px 0 28px;">
        ${ctaButton('Accept Invitation', `${process.env.BASE_URL}/api/create-staff-acc/${token}`)}
      </td>
    </tr>
    ${divider()}
    ${para(`If you didn't expect this invitation, you can safely ignore this email — no account will be created.`, `color:${C.textMuted}; font-size:13px;`)}
  `
  return base(content, { subject: 'You\'ve been invited to Shift Sync', badgeText: 'Invitation', badgeColor: C.blue })
}

// ---------------------------------------------------------------------------
// 2. Swap request sent to Staff B
// ---------------------------------------------------------------------------
function initiateSwap(data) {
  const content = `
    ${heading(`Shift Swap Request from ${data.belongs_to.staffName}`)}
    ${para(`Hi <strong>${data.swapStaff.staffName}</strong>, <strong>${data.belongs_to.staffName}</strong> has requested to swap shifts with you. Your response will be forwarded to your manager — <strong>no changes take effect until they approve.</strong>`)}
    ${sectionLabel('Proposed Swap')}
    ${swapTable([
      { name: `${data.belongs_to.staffName}`, shift: `${data.date}<br><strong>${data.shift_start_time} – ${data.shift_end_time}</strong>` },
      { name: `${data.swapStaff.staffName} <span style="font-weight:400;color:${C.textMuted};">(you)</span>`, shift: `${data.swapDate}<br><strong>${data.swap_shift_start_time} – ${data.swap_shift_end_time}</strong>` },
    ])}
    ${para('Choose your response below. Agreeing simply sends your consent to the manager — they make the final call.')}
    <tr>
      <td align="center" style="padding:4px 0 28px;">
        <table border="0" cellspacing="0" cellpadding="0"><tr>
          <td style="padding-right:12px;">${ctaButton('✓ &nbsp;Agree &amp; Forward to Manager', `${process.env.FRONTEND_URL}/accept-swap/${data.id}`, C.green)}</td>
          <td>${ctaButton('✕ &nbsp;Decline Request', `${process.env.FRONTEND_URL}/decline-swap/${data.id}`, C.red)}</td>
        </tr></table>
      </td>
    </tr>
    ${sectionLabel('What happens next')}
    ${stepList([
      'Your choice is recorded and forwarded to your manager.',
      'The manager reviews and <strong>approves or declines</strong> the swap.',
      'If approved, both schedules and calendar events update automatically.',
      'You\'ll receive a confirmation email of the final decision.',
    ])}
  `
  return base(content, { subject: 'Shift Swap Request', badgeText: 'Action Required', badgeColor: C.amber, headerAccent: C.amber })
}

// ---------------------------------------------------------------------------
// 3. Confirmation to Staff B after they agree
// ---------------------------------------------------------------------------
function staffBConfirmationMail(data) {
  const content = `
    ${heading('You\'ve agreed to the shift swap')}
    ${para(`Hi <strong>${data.swap_belongs_to}</strong>, your consent has been recorded and forwarded to your manager for final approval.`)}
    ${infoBox(`<strong>Status:</strong> Awaiting manager approval — no changes have been made to your schedule yet.`)}
    ${sectionLabel('Swap Details')}
    ${swapTable([
      { name: data.belongs_to, shift: `${data.date} &nbsp;·&nbsp; <strong>${data.shift_start_time} – ${data.shift_end_time}</strong>` },
      { name: `${data.swap_belongs_to} <span style="font-weight:400;color:${C.textMuted};">(you)</span>`, shift: `${data.swapDate} &nbsp;·&nbsp; <strong>${data.swap_shift_start_time} – ${data.swap_shift_end_time}</strong>` },
    ])}
    ${sectionLabel('What happens next')}
    ${stepList([
      'Your manager will review the swap details.',
      'If approved, both schedules and Google Calendar events update automatically.',
      'If declined, you keep your original shift.',
    ])}
  `
  return base(content, { subject: 'Swap Agreement Recorded', badgeText: 'Pending Approval', badgeColor: C.blue })
}

// ---------------------------------------------------------------------------
// 4. Manager review email
// ---------------------------------------------------------------------------
function emailReviewToManager(data) {
  const content = `
    ${heading('A shift swap needs your approval')}
    ${para(`Hi <strong>${data.manager}</strong>, <strong>${data.swap_belongs_to}</strong> has agreed to swap shifts with <strong>${data.belongs_to}</strong>. Please review the details and take action in your dashboard.`)}
    ${sectionLabel('Swap Details')}
    ${swapTable([
      { name: data.belongs_to, shift: `${data.date} &nbsp;·&nbsp; <strong>${data.shift_start_time} – ${data.shift_end_time}</strong>` },
      { name: data.swap_belongs_to, shift: `${data.swapDate} &nbsp;·&nbsp; <strong>${data.swap_shift_start_time} – ${data.swap_shift_end_time}</strong>` },
    ])}
    ${infoBox(`<strong>${data.swap_belongs_to}</strong> has <span style="color:${C.green};font-weight:600;">agreed</span> to the swap and is awaiting your decision.`)}
    <tr>
      <td align="center" style="padding:4px 0 28px;">
        ${ctaButton('Review in Dashboard', `${process.env.FRONTEND_URL}/manager-dashboard`, C.blue)}
      </td>
    </tr>
    ${sectionLabel('What happens after your decision')}
    ${stepList([
      '<strong>Approved:</strong> Both staff schedules and Google Calendar events update automatically.',
      '<strong>Declined:</strong> Both staff members are notified and keep their original shifts.',
    ])}
  `
  return base(content, { subject: 'Swap Approval Required', badgeText: 'Action Required', badgeColor: C.amber, headerAccent: C.amber })
}

// ---------------------------------------------------------------------------
// 5. Staff A notified that Staff B accepted
// ---------------------------------------------------------------------------
function staffAConfirmationMail(data) {
  const content = `
    ${heading(`${data.swap_belongs_to} has agreed to swap`)}
    ${para(`Hi <strong>${data.belongs_to}</strong>, great news — <strong>${data.swap_belongs_to}</strong> has accepted your swap request. It's now with <strong>${data.manager}</strong> for final approval.`)}
    ${infoBox(`<strong>Status:</strong> Pending manager approval — your schedule hasn't changed yet.`)}
    ${sectionLabel('Swap Summary')}
    ${swapTable([
      { name: `${data.belongs_to} <span style="font-weight:400;color:${C.textMuted};">(you)</span>`, shift: `${data.date} &nbsp;·&nbsp; <strong>${data.shift_start_time} – ${data.shift_end_time}</strong>` },
      { name: data.swap_belongs_to, shift: `${data.swapDate} &nbsp;·&nbsp; <strong>${data.swap_shift_start_time} – ${data.swap_shift_end_time}</strong>` },
    ])}
    ${sectionLabel('Next steps')}
    ${stepList([
      `Your manager <strong>${data.manager}</strong> will review and approve or decline.`,
      'If approved, your schedule and calendar will update automatically.',
      'If declined, you keep your original shift and receive a notification.',
    ])}
  `
  return base(content, { subject: 'Swap Update — Pending Manager Approval', badgeText: 'In Review', badgeColor: C.blue })
}

// ---------------------------------------------------------------------------
// 6. Final approval confirmation to each staff member
// ---------------------------------------------------------------------------
function managerConfirmationMail(data) {
  const content = `
    ${heading('Your shift swap has been approved')}
    ${para(`Hi <strong>${data.to.staffName}</strong>, <strong>${data.manager_name}</strong> has approved the shift swap between you and <strong>${data.staffB.staffName}</strong>. Your schedule and calendar have been updated.`)}
    ${sectionLabel('Final Shift Allocation')}
    ${swapTable([
      { name: `${data.to.staffName} <span style="font-weight:400;color:${C.textMuted};">(you)</span>`, shift: `${data.shiftDetails.swapDate} &nbsp;·&nbsp; <strong>${data.shiftDetails.swap_shift_start_time} – ${data.shiftDetails.swap_shift_end_time}</strong>` },
      { name: data.staffB.staffName, shift: `${data.shiftDetails.date} &nbsp;·&nbsp; <strong>${data.shiftDetails.shift_start_time} – ${data.shiftDetails.shift_end_time}</strong>` },
    ])}
    ${infoBox(`Approved by <strong>${data.manager_name}</strong>. Shift changes and Google Calendar events have been applied automatically.`, C.greenLight, C.green)}
    ${sectionLabel('What\'s next')}
    ${stepList([
      'Your roster now reflects the swapped shift.',
      'Your Google Calendar has been updated with the new timing.',
      'You\'ll receive the usual clock-in reminders for your new shift.',
    ])}
  `
  return base(content, { subject: 'Shift Swap Approved', badgeText: 'Approved', badgeColor: C.green, headerAccent: C.green })
}

// ---------------------------------------------------------------------------
// 7. GPS fraud alert to manager
// ---------------------------------------------------------------------------
function gpsFlagAlert(data) {
  const flags = []
  if (data.isDriveByPunch) flags.push(`Drive-by punch detected — speed recorded: <strong>${data.velocityMph} mph</strong>`)
  if (data.isSpoofedGPS)   flags.push('Zero-variance GPS detected — coordinates are suspiciously identical across all polls')

  const content = `
    ${heading('Suspicious Clock-In Detected')}
    ${para(`Hi <strong>${data.managerName}</strong>, a clock-in recorded for <strong>${data.staffName}</strong> has triggered one or more GPS fraud indicators.`)}
    ${sectionLabel('Flags Raised')}
    ${infoBox(flags.map(f => `• ${f}`).join('<br>'), C.redLight, C.red)}
    ${sectionLabel('Clock-In Details')}
    ${detailCard([
      { label: 'Staff Member', value: data.staffName },
      { label: 'Date',         value: data.dateClockedIn },
      { label: 'Time',         value: data.timeClockedIn },
    ])}
    ${para('The clock-in has been recorded normally. This alert is for your awareness only — no automated action has been taken.', `color:${C.textMuted}; font-size:13px;`)}
  `
  return base(content, { subject: 'GPS Clock-In Alert', badgeText: 'Security Alert', badgeColor: C.red, headerAccent: C.red })
}

// ---------------------------------------------------------------------------
// 8. Shift cover notification to candidate staff (Smart Match)
// ---------------------------------------------------------------------------
function shiftCoverNotification(data) {
  const content = `
    ${heading('A shift needs covering — you\'re a great fit')}
    ${para(`Hi <strong>${data.staffName}</strong>, a shift has come up and based on your history you've been identified as a strong match. Would you be able to cover it?`)}
    ${sectionLabel('Shift Details')}
    ${detailCard([
      { label: 'Date',        value: data.shiftDate },
      { label: 'Start Time',  value: data.startTime },
      { label: 'End Time',    value: data.endTime },
      { label: 'Match Score', value: `${Math.round(data.score * 100)}% fit`, highlight: C.green },
    ])}
    <tr>
      <td align="center" style="padding:4px 0 28px;">
        ${ctaButton('View in Marketplace', `${process.env.FRONTEND_URL}/staff-dashboard`)}
      </td>
    </tr>
    ${para('Log in to the app to accept or pass on this shift.', `color:${C.textMuted}; font-size:13px;`)}
  `
  return base(content, { subject: 'Shift Coverage Needed', badgeText: 'Coverage Request', badgeColor: C.blue })
}

// ---------------------------------------------------------------------------
// 9. Face mismatch alert to manager
// ---------------------------------------------------------------------------
function faceMismatchAlert(data) {
  const content = `
    ${heading('Face Verification Failed at Clock-In')}
    ${para(`Hi <strong>${data.managerName}</strong>, a clock-in was recorded for <strong>${data.staffName}</strong>, but the face captured did not match their enrolled profile. This may indicate a buddy-punch attempt.`)}
    ${sectionLabel('Clock-In Details')}
    ${detailCard([
      { label: 'Staff Member',  value: data.staffName },
      { label: 'Date',          value: data.dateClockedIn },
      { label: 'Time',          value: data.timeClockedIn },
      { label: 'Shift',         value: `${data.startOfShift} – ${data.endOfShift}` },
      { label: 'Face Distance', value: `${data.distance} <span style="color:${C.textMuted};">(threshold: ${data.threshold})</span>`, highlight: C.amber },
    ])}
    ${infoBox('The clock-in has been recorded normally. Please review the attendance ledger and take any necessary action.', C.amberLight, C.amber)}
  `
  return base(content, { subject: 'Face Verification Alert', badgeText: 'Security Alert', badgeColor: C.amber, headerAccent: C.amber })
}

// ---------------------------------------------------------------------------
// 10. Leave request submitted — notifies manager
// ---------------------------------------------------------------------------
function leaveRequestSubmitted(data) {
  const typeLabel = { sick: 'Sick Leave', annual: 'Annual Leave', personal: 'Personal Leave' }[data.leaveType] || data.leaveType
  const rows = [
    { label: 'Staff Member', value: data.staffName },
    { label: 'Leave Type',   value: typeLabel },
    { label: 'Start Date',   value: data.startDate },
    { label: 'End Date',     value: data.endDate },
  ]
  if (data.notes) rows.push({ label: 'Notes', value: data.notes })

  const content = `
    ${heading(`New Leave Request from ${data.staffName}`)}
    ${para(`Hi <strong>${data.managerName}</strong>, <strong>${data.staffName}</strong> has submitted a leave request that requires your approval.`)}
    ${sectionLabel('Request Details')}
    ${detailCard(rows)}
    <tr>
      <td align="center" style="padding:4px 0 28px;">
        ${ctaButton('Review in Dashboard', `${process.env.FRONTEND_URL}/manager-dashboard`)}
      </td>
    </tr>
  `
  return base(content, { subject: 'New Leave Request', badgeText: 'Action Required', badgeColor: C.amber, headerAccent: C.amber })
}

// ---------------------------------------------------------------------------
// 11. Leave decision — notifies staff member
// ---------------------------------------------------------------------------
function leaveDecisionNotification(data) {
  const typeLabel   = { sick: 'Sick Leave', annual: 'Annual Leave', personal: 'Personal Leave' }[data.leaveType] || data.leaveType
  const approved    = data.status === 'approved'
  const revoked     = data.status === 'revoked'
  const statusColor = approved ? C.green : revoked ? C.amber : C.red
  const statusLabel = approved ? 'Approved' : revoked ? 'Revoked' : 'Denied'
  const statusBg    = approved ? C.greenLight : revoked ? C.amberLight : C.redLight

  const followUp = approved
    ? 'Your leave dates are now recorded. Any roster shifts on those dates will be blocked automatically.'
    : revoked
    ? 'Your previously approved leave has been cancelled. Please speak with your manager if you have questions.'
    : 'If you have questions about this decision, please speak with your manager directly.'

  const rows = [
    { label: 'Leave Type', value: typeLabel },
    { label: 'Start Date', value: data.startDate },
    { label: 'End Date',   value: data.endDate },
    { label: 'Decision',   value: statusLabel, highlight: statusColor },
  ]
  if (data.managerNotes) rows.push({ label: 'Manager Notes', value: data.managerNotes })

  const content = `
    ${heading(`Your leave request has been ${statusLabel.toLowerCase()}`)}
    ${para(`Hi <strong>${data.staffName}</strong>, your manager has reviewed your leave request.`)}
    ${sectionLabel('Request Details')}
    ${detailCard(rows)}
    ${infoBox(followUp, statusBg, statusColor)}
  `
  return base(content, { subject: `Leave Request ${statusLabel}`, badgeText: statusLabel, badgeColor: statusColor, headerAccent: statusColor })
}

// ---------------------------------------------------------------------------
// 12. Swap declined — notifies Staff A that Staff B said no
// ---------------------------------------------------------------------------
function swapDeclinedNotification(data) {
  const content = `
    ${heading(`${data.staffBName} has declined the swap`)}
    ${para(`Hi <strong>${data.staffAName}</strong>, unfortunately <strong>${data.staffBName}</strong> has declined your shift swap request. The request is now closed and no changes have been made to either schedule.`)}
    ${sectionLabel('Swap Summary')}
    ${swapTable([
      { name: `${data.staffAName} <span style="font-weight:400;color:${C.textMuted};">(you)</span>`, shift: `${data.date} &nbsp;·&nbsp; <strong>${data.shift_start_time} – ${data.shift_end_time}</strong>` },
      { name: data.staffBName, shift: `${data.swapDate} &nbsp;·&nbsp; <strong>${data.swap_shift_start_time} – ${data.swap_shift_end_time}</strong>` },
    ])}
    ${para('You can initiate a new swap request with another colleague from your dashboard.', `color:${C.textMuted}; font-size:14px;`)}
  `
  return base(content, { subject: 'Swap Request Declined', badgeText: 'Declined', badgeColor: C.red, headerAccent: C.red })
}

module.exports = {
  sendingToken,
  initiateSwap,
  staffBConfirmationMail,
  emailReviewToManager,
  managerConfirmationMail,
  staffAConfirmationMail,
  gpsFlagAlert,
  shiftCoverNotification,
  faceMismatchAlert,
  leaveRequestSubmitted,
  leaveDecisionNotification,
  swapDeclinedNotification,
}
