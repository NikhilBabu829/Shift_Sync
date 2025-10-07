const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const TokenSignSchema = new Schema({
    token : { type : String, require : true }
})

module.exports = mongoose.model('ManagerInviteToken', TokenSignSchema)
