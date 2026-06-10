const mongoose = require('mongoose');

const personSchema = new mongoose.SchemaType({
    id:{
        type: Number,
        required: true,
        unique: true
    },
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
        type: Number,
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
module.export= Person;