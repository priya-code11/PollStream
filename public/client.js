let socket;

// UI Elements
const loginOverlay = document.getElementById('login-overlay');
const adminPanel = document.getElementById('admin-panel');
const userAvatarTag = document.getElementById('user-avatar-tag');
const chatTitleText = document.getElementById('chat-title-text');

const questionInput = document.getElementById('poll-question-input');
const optionsInputsContainer = document.getElementById('dynamic-options-inputs');
const addOptionBtn = document.getElementById('add-option-btn');
const submitPollBtn = document.getElementById('submit-poll-btn');

const activePollBubble = document.getElementById('active-poll-bubble');
const displayQuestion = document.getElementById('display-question');
const displayOptionsContainer = document.getElementById('display-options');
const createRoom = document.getElementById("btn-create-fresh-room");

let currentUserRole = null; 
let myVote = null;
let currentRoomId = null;
let authToken = null;


window.handleRegister = async (event) => {
    event.preventDefault();

    const name = document.getElementById('register-name').value.trim();
    const phone_no = document.getElementById('register-phone_no').value.trim();
    const password = document.getElementById('register-password').value;
    const role = document.getElementById('register-role').value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone_no, password, role })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Registration validation failed.");
            return;
        }

        alert("Account created successfully! Switching to Login view.");
        
        // Clear registration input data
        event.target.reset();
        
        // Ensure this function exists globally in your helper code!
        if (typeof toggleAuthCard === 'function') {
            toggleAuthCard('login'); 
        }

    } catch (err) {
        console.error(err);
        alert("Error sending user configuration details.");
    }
};

window.handleLogin = async (event) => {
    event.preventDefault();
    const phone_no = document.getElementById('login-phone_no').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_no, password })
        });

        // 1. CRITICAL FIX: Check if the network response failed FIRST
        if (!response.ok) {
            if (response.status === 401) {
                alert("Login failed: Invalid phone number or password.");
            } else {
                // If it's a 400 or 500 error, try to get the text message safely
                const errText = await response.text();
                alert(`Authentication failed (${response.status}): ${errText}`);
            }
            return; // Stop execution here safely
        }

        // 2. SAFE TO PARSE: We now know the server sent back a 200 OK JSON token
        const data = await response.json();

        // Save our state values securely
        currentUserRole = data.role;
        authToken = data.token;

        // Setup Avatar Icon with the first letter of their name string
        if (userAvatarTag) userAvatarTag.innerText = data.name.charAt(0).toUpperCase();

        if (currentUserRole === 'admin') {
            if (chatTitleText) chatTitleText.innerText = "Admin Control Room";
            document.getElementById('admin-welcome-msg').innerText = `Welcome back, ${data.name}!`;
            
            // Check the backend memory map to see if an active room exists for this Admin
            checkExistingAdminRoom(data.token);
        } else {
            if (chatTitleText) chatTitleText.innerText = "Voter Room View";
            // Regular user: Send straight to the "Enter Room ID" interface card
            toggleAuthCard('user-hub');
        }  

    } catch (err) {
        console.error("Frontend Login Error:", err);
        alert("Error establishing authorization handshake connection: ");
    }
};
// NEW: Click dispatch hooks bound to your dynamic HTML overlay option buttons
window.triggerCreateRoom = () => {
    // We fetch a standard login handshake token stored during authentication processes
    initRealtimeSocket(); 
    socket.emit('createRoom');
};


async function checkExistingAdminRoom(token) {
    try {
        const response = await fetch('/api/admin/check-room', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.hasActiveRoom) {
            document.getElementById('btn-reconnect-room').style.display = 'block';
            currentRoomId = data.roomId; // Pre-cache existing ID matching their account
        } else {
            document.getElementById('btn-reconnect-room').style.display = 'none';
        }
        toggleAuthCard('admin-hub');
    } catch (err) {
        toggleAuthCard('admin-hub');
    }
}

// NEW: Combined utility to hide overlay structures and flash room info text layout
function displayWorkspace(role, roomId) {
    loginOverlay.style.display = "none";
    
    const badge = document.getElementById('active-room-id-badge');
    if (badge) {
        badge.innerText = `ROOM ID: ${roomId}`;
        badge.style.display = 'block';
    }

    if (role === 'admin') {
        if (adminPanel) adminPanel.style.display = "flex";
    } else {
        if (adminPanel) adminPanel.style.display = "none";
    }
}

window.triggerReconnectRoom = () => {
    initRealtimeSocket();
    socket.emit('joinRoom', currentRoomId);
    displayWorkspace('admin', currentRoomId);
};

window.triggerJoinRoom = (event) => {
    event.preventDefault();
    const roomId = document.getElementById('target-room-id-input').value.trim();
    if (!roomId) return;

    currentRoomId = roomId;
    initRealtimeSocket();
    socket.emit('joinRoom', roomId);
};

function initRealtimeSocket() {
    // Ensure we don't build duplicate socket instances
    if (socket) return; 

    // Pass JWT token validation string using options parameters
    socket = io({
        auth: { token: authToken }
    });

    // 3. SHARED REAL-TIME RECEIVER 
    socket.on('updatePoll', (pollData) => {
        // Show the user workspace if they are a regular voter arriving for the first time
        if (currentUserRole !== 'admin' && loginOverlay.style.display !== 'none') {
            displayWorkspace('user', currentRoomId);
        }

        if (!pollData) {
            activePollBubble.style.display = "none";
            return;
        }

        activePollBubble.style.display = "block";
        displayQuestion.innerText = pollData.question;
        displayOptionsContainer.innerHTML = ''; 

        let totalVotes = 0;
        for (const votes of Object.values(pollData.options)) {
            totalVotes += votes;
        }

        for (const [option, votes] of Object.entries(pollData.options)) {
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

            const row = document.createElement('div');
            row.className = `poll-option-row ${myVote === option ? 'voted' : ''}`;
            
            row.innerHTML = `
                <div class="progress-bar" style="width: ${percentage}%"></div>
                <span class="option-text">${option}</span>
                <span class="vote-count">${votes} votes (${percentage}%)</span>
            `;
            
            row.onclick = () => {
                if (currentUserRole === 'admin') {
                    alert("Administrators cannot vote inside their own rooms.");
                    return;
                }
                myVote = option;
                // CHANGED: Package target room identification container with payload metrics
                socket.emit('castVote', { roomId: currentRoomId, selectedOption: option });
            };
            
            displayOptionsContainer.appendChild(row);
        }
    });
    socket.on('voteError', (errMsg) => {
        alert(errMsg);
    });
    // Fired by server layers exclusively to confirmation pipeline signals
    socket.on('roomStateUpdate', (data) => {
        currentRoomId = data.roomId;
        displayWorkspace('admin', currentRoomId);
    });
}

// 2. ADMIN ACTIONS (Adding form fields)
addOptionBtn.onclick = () => {
    const inputs = optionsInputsContainer.getElementsByTagName('input');
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.className = 'option-input';
    newInput.placeholder = `Option ${inputs.length + 1}`;
    optionsInputsContainer.appendChild(newInput);
};

// ADMIN ACTIONS (Publishing the poll configuration)
submitPollBtn.onclick = (event) => {
    if (event) event.preventDefault();

    const question = questionInput.value.trim();
    const inputElements = document.getElementsByClassName('option-input');
    
    let optionsArray = [];
    for (let input of inputElements) {
        if (input.value.trim() !== "") {
            optionsArray.push(input.value.trim());
        }
    }

    if (!question || optionsArray.length < 2) {
        alert("Please enter a question and at least 2 options!");
        return;
    }

    if (!socket) {
        alert("Real-time engine disconnected. Please re-authenticate.");
        return;
    }

    socket.emit('createPoll', { 
        roomId: currentRoomId, 
        question: question, 
        options: optionsArray 
    });
    myVote = null;

    questionInput.value = "";
    optionsInputsContainer.innerHTML = `
        <input type="text" class="option-input" placeholder="Option 1">
        <input type="text" class="option-input" placeholder="Option 2">
    `;
};

