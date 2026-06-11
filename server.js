require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Person = require('./models/person')
const passport = require('passport')
const initializePassport = require('./passport/config');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('./public'));

const server = http.createServer(app);
const io = new Server(server);

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Successfully connected to MongoDB.');
    })
    .catch(err => {
        console.error('Database connection error:', err);
    });

// Tracks all active admin rooms and their states
// Structure: 
// { 
//   "room_123": { 
//       adminId: "123", 
//       currentPoll: null, 
//       votedUsers: Set() 
//    } 
// }
let liveRooms = {};

app.post('/api/register', async (req, res) => {
    try {
        const { name, role, phone_no, password } = req.body;

        const existingUser = await Person.findOne({ phone_no });
        if (existingUser) return res.status(400).json({ message: "Phone Number already registered" });

        // HASH THE PASSWORD HERE SO BCRYPT CAN READ IT ON LOGIN
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newPerson = new Person({
            name,
            role,
            phone_no,
            password: hashedPassword
        });

        await newPerson.save();
        res.status(201).json({ message: "Registration successful" });
    } catch (error) {
        res.status(500).json({ message: "Error registering user" });
    }
});


initializePassport(passport);

app.post('/api/login', passport.authenticate('local', { session: false }), (req, res) => {
    // If code reaches here, Passport successfully authenticated the user!
    // The authenticated user object is automatically available at req.user
    
    const token = jwt.sign(
        { id: req.user._id, name: req.user.name, role: req.user.role },
        process.env.JWT_SECRET,
        { expiresIn: '5h' }
    );

    res.json({ token, role: req.user.role, name: req.user.name });
});

app.get('/api/admin/check-room', passport.authenticate('local', { session: false }), (req, res) => {
    const expectedRoomId = `room_${req.user._id}`;
    
    if (liveRooms[expectedRoomId]) {
        return res.json({ hasActiveRoom: true, roomId: expectedRoomId });
    }
    res.json({ hasActiveRoom: false });
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. Decode the token passed from client auth to discover user identity
    const token = socket.handshake.auth.token;
    let connectedUser = null;
    
    if (token) {
        try {
            connectedUser = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            console.error("Socket authentication invalid:", err.message);
        }
    }

    socket.on('createRoom', () => {
    if (!connectedUser || connectedUser.role !== 'admin') return;

    const roomId = `room_${connectedUser.id}`;

    // Initialize or overwrite a fresh room object
    liveRooms[roomId] = {
        adminId: connectedUser.id,
        currentPoll: null,
        votedUsers: new Set()
    };

    socket.join(roomId);
    
    // Send acknowledgment back to Admin to load their dashboard and show the room_id
    socket.emit('roomStateUpdate', { 
        roomId: roomId, 
        currentPoll: null 
    });
    });

    socket.on('joinRoom', (roomId) => {
    if (!connectedUser) return;

    // Check if the admin has actually initialized this room code
    if (!liveRooms[roomId]) {
        return socket.emit('voteError', 'Invalid Room ID. This room does not exist.');
    }

    socket.join(roomId);
    console.log(`User ${connectedUser.name} joined room: ${roomId}`);

    // Instantly send the room's current poll state to this specific user
    socket.emit('updatePoll', liveRooms[roomId].currentPoll);
    });

    socket.on('createPoll', (data) => {
        // 2. Safely verify identity using the verified token payload
        if (!connectedUser || connectedUser.role !== 'admin') {
            socket.emit('voteError', 'Unauthorized: Only admins can issue new polls.');
            return;
        }

        const targetRoom = liveRooms[data.roomId];
        if (!targetRoom) return;

        targetRoom.votedUsers.clear();

        let newOptions = {};
        data.options.forEach(option => {
            if(option.trim() !== "") {
                newOptions[option] = 0; // Initialize votes to 0
            }
        });

        targetRoom.currentPoll = {
            question: data.question,
            options: newOptions
        };

        // Broadcast the brand new poll to EVERYONE connected
        io.to(data.roomId).emit('updatePoll', targetRoom.currentPoll);
    });

    // 2. Listen for when someone votes
    socket.on('castVote', ({roomId,selectedOption}) => {
    if (!connectedUser) {
        socket.emit('voteError', 'You must log in to participate.');
        return;
    }

    const targetRoom = liveRooms[roomId];
    if (!targetRoom) return;

    // Track via DB Account ID instead of temporary socket connections
    if (targetRoom.votedUsers.has(connectedUser.id)) {
        socket.emit('voteError', 'You have already voted in this poll!');
        return;
    }

    const poll = targetRoom.currentPoll;
    if (poll && poll.options[selectedOption] !== undefined) {
        poll.options[selectedOption] += 1;
        targetRoom.votedUsers.add(connectedUser.id);
        
        // Broadcast real-time score updates strictly to this room's occupants
        io.to(roomId).emit('updatePoll', poll);
    }
});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});