const mongoose = require('mongoose')
const Schema = mongoose.Schema

// Stores the AI conversation history for a single manager's chat session
const ManagerChatSessionSchema = new Schema({
    manager: { type: Schema.Types.ObjectId, ref: 'Manager', required: true }, // owner of the session
    messages: [
        {
            role:      { type: String, enum: ['user', 'model'], required: true }, // who sent the message
            content:   { type: String, required: true },                           // message text
            timestamp: { type: Date, default: Date.now }                           // when the message was recorded
        }
    ],
    resolvedIntent: { type: String, default: null }, // the last successfully completed intent type
    resolvedAt:     { type: Date, default: null },    // when the session was closed; null means still open
    createdAt:      { type: Date, default: Date.now } // session creation timestamp
})

module.exports = mongoose.model('ManagerChatSession', ManagerChatSessionSchema)
