// NOTE: This model is superseded by the swap fields on the main Shift model; kept for historical reference
const mongoose = require('mongoose')
const Schema = mongoose.Schema;

// Standalone swap shift document (legacy — swap data now lives inline on the Shift schema)
const ShiftSchema = new Schema({
    swap_date : {type : Date, required : true},                                    // date the swap would take effect
    swap_belongs_to : {type : Schema.Types.ObjectId, ref : 'Staff', required : true}, // staff member being offered the swap
    swap_shift_start_time : {type : Date, rqeuired : true},  // start time of the swapped shift (note: typo in key is intentional to match existing data)
    swap_shift_end_time : {type : Date, required : true},    // end time of the swapped shift
    swap_shift_length : {type : Number},                     // duration of the swapped shift in fractional hours
})

module.exports = mongoose.model('SwapShift', ShiftSchema)
