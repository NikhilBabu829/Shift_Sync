const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const ShiftSchema = new Schema({
    date : {type : String},
    belongs_to : {type : Schema.Types.ObjectId, ref : 'Staff'}, 
    shift_start_time : {type : String},
    shift_end_time : {type : String},
    shift_length : {type : Number},
    swapDate : {type : String},
    swap_belongs_to : {type : Schema.Types.ObjectId, ref : 'Staff'}, 
    swap_shift_start_time : {type : String},
    swap_shift_end_time : {type : String},
    swap_shift_length : {type : Number},
})

module.exports = mongoose.model('Shift', ShiftSchema)
