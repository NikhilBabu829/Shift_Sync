const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const StaffSchema = new Schema({
    google_id : {type : String}
})

module.exports = mongoose.model('Staff', StaffSchema);
