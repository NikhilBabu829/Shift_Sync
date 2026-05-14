const mongoose = require('mongoose')
const Schema = mongoose.Schema

const ChatSessionSchema = new Schema({
    staffMember : {type : Schema.Types.ObjectId, ref : 'Staff', required : true},
    messages : [
        {
            role : {type : String, enum : ['user', 'model'], required : true},
            content : {type : String, required : true},
            timestamp : {type : Date, default : Date.now}
        }
    ],
    resolvedIntent : {type : String, default : null},
    resolvedAt : {type : Date, default : null},
    createdAt : {type : Date, default : Date.now}
})

module.exports = mongoose.model('ChatSession', ChatSessionSchema)
