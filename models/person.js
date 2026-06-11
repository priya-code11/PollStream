const mongoose = require('mongoose');

const personSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    role:{
        type: String,
        enum: ['admin','user'],
        default: 'user'
    },
    phone_no:{
        type: String,
        required: true,
        minlength: 10
    },
    password:{
        type: String,
        required: true,
        minlength: 6
    }
});

const Person = mongoose.model('Person', personSchema);
module.exports= Person;