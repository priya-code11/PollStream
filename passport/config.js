const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs'); // Use bcryptjs to match your server.js import
const Person = require('../models/person'); // Note the lowercase 'p' from your server error stack

function initialize(passport) {
    passport.use(new LocalStrategy({ 
        usernameField: 'phone_no',  // Tells passport to map 'phone_no' from req.body to the first parameter below
        passwordField: 'password'
    }, async (phone_no, password, done) => {
        try {
            // Find user in database
            const user = await Person.findOne({ phone_no });
            if (!user) {
                return done(null, false, { message: 'Invalid credentials' });
            }

            // Check encrypted password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return done(null, false, { message: 'Invalid credentials' });
            }

            // Success! Send user down the pipeline
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }));
}

module.exports = initialize;