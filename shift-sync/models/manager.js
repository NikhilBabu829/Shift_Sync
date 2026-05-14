const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const ManagerSchema = new Schema({
    first_name : { type : String, required : true },
    last_name : { type : String, required : true },
    email : { type : String, required : true},
    password : {type : String, required : true},
    manager : {type : Boolean, required : true},
    org_name : { type : String, default : '' },
    hq_coordinates : {
        lat : { type : Number, default : null },
        lng : { type : Number, default : null }
    }
})

module.exports = mongoose.model('Manager', ManagerSchema);
