
const signedToken = {}

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
                  <a href=http://localhost:3000/api/join/${token}
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


module.exports = { sendingToken }
