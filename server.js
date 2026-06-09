const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// This will hold whatever poll a user creates
let currentPoll = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // If a poll already exists, send it to the newly connected user
    if (currentPoll) {
        socket.emit('updatePoll', currentPoll);
    }

    // 1. Listen for when a user creates a new poll
    socket.on('createPoll', (data) => {
        // data structure: { question: "...", options: ["Opt 1", "Opt 2"] }
        
        let newOptions = {};
        data.options.forEach(option => {
            if(option.trim() !== "") {
                newOptions[option] = 0; // Initialize votes to 0
            }
        });

        currentPoll = {
            question: data.question,
            options: newOptions
        };

        // Broadcast the brand new poll to EVERYONE connected
        io.emit('updatePoll', currentPoll);
    });

    // 2. Listen for when someone votes
    socket.on('castVote', (selectedOption) => {
        if (currentPoll && currentPoll.options[selectedOption] !== undefined) {
            currentPoll.options[selectedOption] += 1;
            
            // Broadcast the updated vote counts to everyone
            io.emit('updatePoll', currentPoll);
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});