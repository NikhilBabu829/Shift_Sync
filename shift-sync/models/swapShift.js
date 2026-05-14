const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const ShiftSchema = new Schema({
    swap_date : {type : Date, required : true},
    swap_belongs_to : {type : Schema.Types.ObjectId, ref : 'Staff', required : true}, 
    swap_shift_start_time : {type : Date, rqeuired : true},
    swap_shift_end_time : {type : Date, required : true},
    swap_shift_length : {type : Number},
})

module.exports = mongoose.model('SwapShift', ShiftSchema)
