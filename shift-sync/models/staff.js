const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const StaffSchema = new Schema({
    first_name : { type : String, required : true },
    last_name : { type : String, required : true },
    email : { type : String, required : true},
    manager : {type : Boolean}
})

module.exports = mongoose.model('Staff', StaffSchema);
