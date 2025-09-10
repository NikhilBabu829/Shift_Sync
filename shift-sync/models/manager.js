const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const ManagerSchema = new Schema({
    first_name : { type : String, required : true },
    last_name : { type : String, required : true },
    email : { type : String, required : true},
    password : {type : String, required : true},
    manager : {type : Boolean, required : true} 
})

module.exports = mongoose.model('Manager', ManagerSchema);
