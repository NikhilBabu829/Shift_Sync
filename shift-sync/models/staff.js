const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const StaffSchema = new Schema({
    google_id : {type : String},
    email : {type : String},
    staffName : {type : String},
    profile_picture : {type : String}
})

module.exports = mongoose.model('Staff', StaffSchema);
