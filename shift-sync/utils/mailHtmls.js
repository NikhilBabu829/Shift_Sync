
function sendingToken(token){
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <title>Invitation</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table width="600" style="background-color: #ffffff; padding: 20px; border-radius: 8px;">
              <tr>
                <td align="center" style="font-size: 20px; font-weight: bold; color: #333;">
                  You’ve been invited!
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 20px; font-size: 16px; color: #555;">
                  Click the button below to accept your invitation.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 20px;">
                  <a href=http://localhost:3000/api/create-staff-acc/${token}
                    style="background-color: #007BFF; color: #ffffff; padding: 12px 24px; 
                            text-decoration: none; border-radius: 5px; font-size: 16px; 
                            display: inline-block;">
                    Accept Invitation
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-top: 20px; font-size: 12px; color: #999;">
                  If you did not expect this email, you can safely ignore it.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`
} 

function initiateSwap(data){
  return `
  <!DOCTYPE html>
  <html lang="en">
    <body style="font-family: Arial, sans-serif; background:#f8f9fa; padding:20px; color:#333;">
      <div style="max-width:650px; margin:auto; background:#fff; padding:24px; border-radius:10px;">
        <h2 style="color:#2a6df4; margin-top:0;">Shift Swap Request</h2>

        <p>Hi <strong>${data.swapStaff.staffName}</strong>,</p>

        <p>
          <strong>${data.belongs_to.staffName}</strong> is requesting to swap shifts with you.
          Your response will be forwarded to the manager for final approval.
          <strong>No changes will take effect until the manager approves.</strong>
        </p>

        <h3 style="margin:18px 0 10px;">Swap Summary</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#eef3ff;">
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Staff Member</th>
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Current Shift</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.belongs_to.staffName}</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.date} — ${data.shift_start_time} to ${data.shift_end_time}<br>
              </td>
            </tr>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.swapStaff.staffName} (You)</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.swap_date} — ${data.swap_shift_start_time} to ${data.swap_shift_end_time}<br>
              </td>
            </tr>
          </tbody>
        </table>

        <p style="margin-top:16px;">
          If you <strong>Agree</strong>, we’ll send your consent to the manager.
          If you <strong>Reject</strong>, the request will be closed.
        </p>

        <div style="text-align:center; margin:24px 0 8px;">
          <a href=http://localhost:3000/api/staffB-accepts/${data.id}
            style="background:#28a745; color:#fff; text-decoration:none; padding:12px 20px; border-radius:6px; font-weight:bold; margin-right:10px;">
            ✅ Agree & Forward to Manager
          </a>
          <a href="{{reject_link}}"
            style="background:#dc3545; color:#fff; text-decoration:none; padding:12px 20px; border-radius:6px; font-weight:bold;">
            ❌ Reject
          </a>
        </div>

        <p style="text-align:center; margin:8px 0 22px;">
          <a href="{{view_request_link}}" style="color:#2a6df4; text-decoration:none;">View full request & add a note</a>
        </p>

        <h4 style="margin:0 0 8px;">What happens next?</h4>
        <ul style="margin:0 0 16px 18px; padding:0;">
          <li>Your choice is recorded and sent to the manager.</li>
          <li>Manager reviews and <strong>Approves/Declines</strong> the swap.</li>
          <li>If approved, both schedules and calendar events are automatically updated.</li>
          <li>You’ll get a confirmation email of the final decision.</li>
        </ul>

        <p style="margin-top:22px;">Thanks,<br><strong>Shift-Sync</strong></p>

        <hr style="border:none; border-top:1px solid #eee; margin:22px 0 8px;">
        <small style="color:#777;">
          This is an automated message. Links may expire after {{link_expiry_hours}} hours for security.
        </small>
      </div>
    </body>
  </html>
  `
}

function staffBConfirmationMail(data){
  return `
    <!DOCTYPE html>
  <html lang="en">
    <body style="font-family: Arial, sans-serif; background-color:#f8f9fa; padding:20px; color:#333;">
      <div style="max-width:650px; margin:auto; background:#fff; padding:25px; border-radius:10px;">
        <h2 style="color:#2a6df4; margin-top:0;">Shift Swap Confirmation</h2>

        <p>Hi <strong>${data.swap_belongs_to}</strong>,</p>

        <p>
          You’ve <strong>agreed</strong> to swap your shift with <strong>${data.belongs_to}</strong>.  
          Your confirmation has been successfully recorded and forwarded to your manager for review.
        </p>

        <h3 style="margin:20px 0 10px;">Swap Details</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#eef3ff;">
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Staff Member</th>
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Current Shift</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.belongs_to}</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.date} — ${data.shift_start_time} to ${data.shift_end_time}<br>
              </td>
            </tr>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.swap_belongs_to} (You)</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.swapDate} — ${data.swap_shift_start_time} to ${data.swap_shift_end_time}<br>
              </td>
            </tr>
          </tbody>
        </table>

        <p style="margin-top:16px;">
          Your request is now <strong>Pending Manager Approval</strong>.  
          Once the manager reviews and approves, you’ll receive a final confirmation email.
        </p>

        <h4 style="margin:0 0 8px;">What happens next?</h4>
        <ul style="margin:0 0 20px 18px; padding:0;">
          <li>The manager will review the swap details.</li>
          <li>If approved, both your schedules and calendar events will be automatically updated.</li>
          <li>If declined, you’ll retain your original shift.</li>
        </ul>

        <p style="margin-top:20px;">Thanks for your quick response,<br>
        <strong>Shift-Sync Team</strong></p>

        <hr style="border:none; border-top:1px solid #eee; margin-top:30px;">
        <small style="color:#777;">
          This is an automated message. Please do not reply directly.  
          You’ll be notified once your manager makes a decision.
        </small>
      </div>
    </body>
  </html>
`
}

function emailReviewToManager(data){
  return `
  <!DOCTYPE html>
  <html lang="en">
    <body style="font-family: Arial, sans-serif; background-color:#f8f9fa; padding:20px; color:#333;">
      <div style="max-width:650px; margin:auto; background:#fff; padding:25px; border-radius:10px;">
        <h2 style="color:#2a6df4; margin-top:0;">Shift Swap Approval Required</h2>

        <p>Hi <strong>${data.manager}</strong>,</p>

        <p>
          A new shift swap request has been approved by <strong>${data.swap_belongs_to}</strong> and now awaits your review.
          Please review the swap details below and decide whether to approve or decline the request.
        </p>

        <h3 style="margin:20px 0 10px;">Swap Details</h3>

        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#eef3ff;">
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Staff Member</th>
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Current Shift</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.belongs_to}</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.date} — ${data.shift_start_time} to ${data.shift_end_time}<br>
              </td>
            </tr>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.swap_belongs_to}</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.swapDate} — ${data.swap_shift_start_time} to ${data.swap_shift_end_time}<br>
              </td>
            </tr>
          </tbody>
        </table>

        <p style="margin-top:16px;">
          <strong>Status:</strong> ${data.swap_belongs_to} has <span style="color:green;">agreed</span> to the swap.  
          Please confirm whether to <strong>approve</strong> or <strong>decline</strong> the swap below.
        </p>

        <div style="text-align:center; margin:25px 0;">
          <a href="http://localhost:3000/api/swap-final-approval/${data.id}"
            style="background-color:#28a745; color:white; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:bold; margin-right:10px;">
            ✅ Approve Swap
          </a>
          <a href="{{decline_link}}"
            style="background-color:#dc3545; color:white; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:bold;">
            ❌ Decline Swap
          </a>
        </div>

        <h4 style="margin:0 0 8px;">What happens after your decision?</h4>
        <ul style="margin:0 0 20px 18px; padding:0;">
          <li>If <strong>approved</strong>, both staff schedules and Google Calendar events will be automatically updated.</li>
          <li>If <strong>declined</strong>, both staff members will be notified and keep their original shifts.</li>
        </ul>

        <p style="margin-top:20px;">Thank you,<br>
        <strong>Shift-Sync System</strong></p>

        <hr style="border:none; border-top:1px solid #eee; margin-top:30px;">
        <small style="color:#777;">
          This is an automated email from Shift-Sync.  
          Please do not reply directly.
        </small>
      </div>
    </body>
  </html>
  `
}

function staffAConfirmationMail(data){
  return `
    <!DOCTYPE html>
  <html lang="en">
    <body style="font-family: Arial, sans-serif; background-color:#f8f9fa; padding:20px; color:#333;">
      <div style="max-width:650px; margin:auto; background:#fff; padding:25px; border-radius:10px;">
        <h2 style="color:#2a6df4; margin-top:0;">Shift Swap Update</h2>

        <p>Hi <strong>${data.belongs_to}</strong>,</p>

        <p>
          Great news — <strong>${data.swap_belongs_to}</strong> has <span style="color:green;">accepted</span> your request to swap shifts.  
          The request has now been forwarded to your manager for final review and approval.
        </p>

        <h3 style="margin:20px 0 10px;">Swap Summary</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#eef3ff;">
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Staff Member</th>
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Current Shift</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.belongs_to} (You)</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.date} — ${data.shift_start_time} to ${data.shift_end_time}<br>
              </td>
            </tr>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.swap_belongs_to}</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.swapDate} — ${data.swap_shift_start_time} to ${data.swap_shift_end_time}<br>
              </td>
            </tr>
          </tbody>
        </table>

        <p style="margin-top:16px;">
          ${data.manager} will now review the request. Once they make a decision, you’ll receive an automatic
          email confirming whether the swap has been <strong>approved</strong> or <strong>declined</strong>.
        </p>

        <h4 style="margin:0 0 8px;">Next steps</h4>
        <ul style="margin:0 0 20px 18px; padding:0;">
          <li>Your request is <strong>awaiting manager approval</strong>.</li>
          <li>If approved, your schedule and calendar will update automatically.</li>
          <li>If declined, you’ll keep your original shift and receive a notification.</li>
        </ul>

        <p style="margin-top:20px;">Thanks for using <strong>Shift-Sync</strong>!<br>
        <strong>The Shift-Sync Team</strong></p>

        <hr style="border:none; border-top:1px solid #eee; margin-top:30px;">
        <small style="color:#777;">
          This is an automated message. Please do not reply directly.  
          You’ll receive another update once your manager makes a decision.
        </small>
      </div>
    </body>
  </html>
  `
}

function managerConfirmationMail(data){
  return `
    <!DOCTYPE html>
  <html lang="en">
    <body style="font-family: Arial, sans-serif; background-color:#f8f9fa; padding:20px; color:#333;">
      <div style="max-width:650px; margin:auto; background:#fff; padding:25px; border-radius:10px;">
        <h2 style="color:#2a6df4; margin-top:0;">Shift Swap Approved ✅</h2>

        <p>Hi <strong>${data.to.staffName}</strong>,</p>

        <p>
          Your shift swap request between <strong>${data.to.staffName}</strong> and <strong>${data.staffB.staffName}</strong>
          has been <span style="color:green;"><strong>approved</strong></span> by your manager.
        </p>

        <h3 style="margin:20px 0 10px;">Final Swap Details</h3>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#eef3ff;">
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">Staff Member</th>
              <th style="text-align:left; padding:10px; border:1px solid #ddd;">New Shift</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.to.staffName}</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.shiftDetails.swapDate} — ${data.shiftDetails.swap_shift_start_time} to ${data.shiftDetails.swap_shift_end_time}<br>
              </td>
            </tr>
            <tr>
              <td style="padding:10px; border:1px solid #ddd;"><strong>${data.staffB.staffName}</strong></td>
              <td style="padding:10px; border:1px solid #ddd;">
                ${data.shiftDetails.date} — ${data.shiftDetails.shift_start_time} to ${data.shiftDetails.shift_end_time}<br>
              </td>
            </tr>
          </tbody>
        </table>

        <h4 style="margin:0 0 8px;">Summary</h4>
        <ul style="margin:0 0 20px 18px; padding:0;">
          <li>Manager: <strong>${data.manager_name}</strong> has approved your swap.</li>
          <li>Shift changes have been applied automatically.</li>
          <li>You’ll receive reminders for your new shift timings as usual.</li>
        </ul>

        <p style="margin-top:20px;">Thanks for keeping your team coordinated,<br>
        <strong>Shift-Sync Team</strong></p>

        <hr style="border:none; border-top:1px solid #eee; margin-top:30px;">
        <small style="color:#777;">
          This is an automated message from Shift-Sync.  
          Please do not reply directly.
        </small>
      </div>
    </body>
  </html>
  `
}

function gpsFlagAlert(data) {
  const flags = []
  if (data.isDriveByPunch) flags.push(`Drive-by punch detected — speed recorded: <strong>${data.velocityMph} mph</strong>`)
  if (data.isSpoofedGPS) flags.push('Zero-variance GPS detected — coordinates are suspiciously identical across all polls')

  return `
  <!DOCTYPE html>
  <html lang="en">
    <body style="font-family: Arial, sans-serif; background:#f8f9fa; padding:20px; color:#333;">
      <div style="max-width:650px; margin:auto; background:#fff; padding:24px; border-radius:10px; border-left: 5px solid #dc3545;">
        <h2 style="color:#dc3545; margin-top:0;">GPS Clock-In Alert</h2>

        <p>Hi <strong>${data.managerName}</strong>,</p>

        <p>A suspicious clock-in was recorded for <strong>${data.staffName}</strong> and requires your review.</p>

        <h3 style="margin:18px 0 10px;">Flags Raised</h3>
        <ul style="margin:0 0 16px 18px; padding:0;">
          ${flags.map(f => `<li style="margin-bottom:6px;">${f}</li>`).join('')}
        </ul>

        <h3 style="margin:18px 0 10px;">Clock-In Details</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Staff Member</td>
            <td style="padding:8px; border:1px solid #ddd;">${data.staffName}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Date</td>
            <td style="padding:8px; border:1px solid #ddd;">${data.dateClockedIn}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Time</td>
            <td style="padding:8px; border:1px solid #ddd;">${data.timeClockedIn}</td>
          </tr>
        </table>

        <p style="margin-top:16px; color:#777; font-size:13px;">
          The clock-in has been recorded normally. This alert is for your awareness only — no action has been taken automatically.
        </p>

        <p style="margin-top:20px;">Regards,<br><strong>Shift-Sync System</strong></p>
      </div>
    </body>
  </html>
  `
}

function shiftCoverNotification(data) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <body style="font-family: Arial, sans-serif; background:#f8f9fa; padding:20px; color:#333;">
      <div style="max-width:650px; margin:auto; background:#fff; padding:24px; border-radius:10px;">
        <h2 style="color:#2a6df4; margin-top:0;">Shift Coverage Needed</h2>

        <p>Hi <strong>${data.staffName}</strong>,</p>

        <p>
          A shift needs covering and based on your schedule history, you're a great fit.
          Would you be able to cover the following shift?
        </p>

        <h3 style="margin:18px 0 10px;">Shift Details</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Date</td>
            <td style="padding:8px; border:1px solid #ddd;">${data.shiftDate}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Start Time</td>
            <td style="padding:8px; border:1px solid #ddd;">${data.startTime}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">End Time</td>
            <td style="padding:8px; border:1px solid #ddd;">${data.endTime}</td>
          </tr>
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Match Score</td>
            <td style="padding:8px; border:1px solid #ddd;">${Math.round(data.score * 100)}% likely fit</td>
          </tr>
        </table>

        <p style="margin-top:16px;">Please log in to the app to accept or decline this shift.</p>

        <p style="margin-top:20px;">Thanks,<br><strong>Shift-Sync Team</strong></p>

        <hr style="border:none; border-top:1px solid #eee; margin-top:30px;">
        <small style="color:#777;">This is an automated message. Please do not reply directly.</small>
      </div>
    </body>
  </html>
  `
}

module.exports = { sendingToken, initiateSwap, staffBConfirmationMail, emailReviewToManager, managerConfirmationMail, staffAConfirmationMail, gpsFlagAlert, shiftCoverNotification }
