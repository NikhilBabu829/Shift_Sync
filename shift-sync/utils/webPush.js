const webPush = require('web-push')

webPush.setVapidDetails(
    'mailto:' + (process.env.GMAIL || 'admin@shiftsync.app'),
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
)

/**
 * Sends a push notification to a single subscription object.
 * Silently ignores failures so one bad subscription never blocks the main flow.
 */
async function sendPush(subscription, payload) {
    if (!subscription || !subscription.endpoint) return
    try {
        await webPush.sendNotification(subscription, JSON.stringify(payload))
    } catch (err) {
        // 410 Gone means the subscription has expired — caller should clean it up
        if (err.statusCode !== 410) {
            console.error('web-push error:', err.statusCode, err.message)
        }
    }
}

/**
 * Sends the same push notification to every subscription in an array.
 * Non-blocking — individual failures do not prevent the others from being sent.
 */
async function sendPushToMany(subscriptions, payload) {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) return
    await Promise.allSettled(subscriptions.map(sub => sendPush(sub, payload)))
}

module.exports = { sendPush, sendPushToMany }
