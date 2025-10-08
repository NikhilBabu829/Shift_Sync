const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const ShiftSchema = new Schema({
    date : {type : Date, required : true},
    belongs_to : {type : Schema.Types.ObjectId, ref : 'Staff', required : true}, 
    shift_start_time : {type : Date, rqeuired : true},
    shift_end_time : {type : Date, required : true},
    shift_length : {type : Number, required : true},
})

module.exports = mongoose.model('Shift', ShiftSchema)
