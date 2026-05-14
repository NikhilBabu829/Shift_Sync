                                   
const mongoose = require('mongoose');
require('dotenv').config();
const Shift = require('./models/shift');
                                                                                                    
mongoose.connect(`mongodb+srv://${process.env.MONGODB_URI}`).then(async () => {
await Shift.create({                                                                              
    date: '2026-04-17',                                                                             
    belongs_to: '69d7611e4653bdff182bfd52',
    shift_start_time: '16:00',                                                                      
    shift_end_time: '00:30',                                                                        
    shift_length: 8.5,
    status: 'filled'                                                                                
});                                                     
console.log('Shift created');
process.exit(0);                                                                                  
});
