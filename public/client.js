let socket; 
let currentRoomId = null; 
let currentUserRole = null; 
let myVote = null;

// Read invite link on immediate script execution
const urlParams = new URLSearchParams(window.location.search);
let inviteRoomId = urlParams.get('room'); 

if (inviteRoomId) {
    console.log(`Detected deep link request for Room ID: ${inviteRoomId}`);
}

// Global UI Elements
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
const roomIdBadge = document.getElementById('active-room-id-badge');

// ==========================================
// 1. AUTHENTICATION HANDLERS
// ==========================================

window.handleLogin = async (event) => {
    event.preventDefault();
    // Matches id="login-phone_no" from your HTML
    const phone_no = document.getElementById('login-phone_no').value.trim(); 
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_no, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Invalid login credentials.");
            return;
        }

        localStorage.setItem('jwtToken', data.token);
        currentUserRole = data.role;
        
        if (currentUserRole === 'admin') {
            userAvatarTag.innerText = "A";
            chatTitleText.innerText = `${data.name} (Admin Hub)`;
            
            // Query backend session record index tracking state loops
            await checkExistingAdminRoom(data.token);
        } else {
            userAvatarTag.innerText = "V";
            chatTitleText.innerText = `${data.name} (Voter Mode)`;
            
            initRealtimeSocket(data.token);

            // AUTO-ROUTE LOGIC: Bypass routing card if invited via link parameters
            if (inviteRoomId) {
                currentRoomId = inviteRoomId;
                socket.emit('joinRoom', inviteRoomId);
                
                loginOverlay.style.display = "none";
                if (roomIdBadge) {
                    roomIdBadge.style.display = "block";
                    roomIdBadge.innerText = `ROOM ID: ${inviteRoomId}`;
                }
            } else {
                toggleAuthCard('user-hub');
            }
        }

    } catch (err) {
        console.error(err);
        alert("Server communication error during authentication.");
    }
};

window.handleRegister = async (event) => {
    event.preventDefault();

    const name = document.getElementById('register-name').value.trim();
    // Matches id="register-phone_no" from your HTML
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
            alert(data.message || "Registration failed.");
            return;
        }

        alert("Account registered successfully! Please log in.");
        event.target.reset();
        toggleAuthCard('login'); 

    } catch (err) {
        console.error(err);
        alert("Error dispatching registration payload.");
    }
};

// ==========================================
// 2. ROOM & SESSION LIFECYCLE MANAGEMENT
// ==========================================

async function checkExistingAdminRoom(token) {
    const reconnectBtn = document.getElementById('btn-reconnect-room');
    try {
        const response = await fetch('/api/admin/check-room', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (reconnectBtn) reconnectBtn.style.display = 'none';
            return;
        }

        const data = await response.json();

        if (data.hasActiveRoom) {
            currentRoomId = data.roomId; 
            if (reconnectBtn) reconnectBtn.style.display = 'block';
        } else {
            currentRoomId = null;
            if (reconnectBtn) reconnectBtn.style.display = 'none';
        }
    } catch (err) {
        console.error("Session sync failed:", err);
        if (reconnectBtn) reconnectBtn.style.display = 'none';
    } finally {
        toggleAuthCard('admin-hub');
    }
}

window.triggerCreateRoom = () => {
    const token = localStorage.getItem('jwtToken');
    initRealtimeSocket(token);
    
    socket.once('connect', () => {
        socket.emit('createRoom');
    });

    socket.once('roomStateUpdate', (data) => {
        const newUrl = `${window.location.origin}/?room=${data.roomId}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
        if (roomIdBadge) {
            roomIdBadge.style.display = "block";
            roomIdBadge.innerText = `ROOM ID: ${data.roomId}`;
        }
    });
    
    loginOverlay.style.display = "none";
    adminPanel.style.display = "flex";
};

window.triggerReconnectRoom = () => {
    const token = localStorage.getItem('jwtToken');
    initRealtimeSocket(token);

    socket.once('connect', () => {
        socket.emit('joinRoom', currentRoomId);
    });

    const newUrl = `${window.location.origin}/?room=${currentRoomId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    loginOverlay.style.display = "none";
    adminPanel.style.display = "flex";
    if (roomIdBadge) {
        roomIdBadge.style.display = "block";
        roomIdBadge.innerText = `ROOM ID: ${currentRoomId}`;
    }
};

window.triggerJoinRoom = (event) => {
    if (event) event.preventDefault();
    
    const roomId = document.getElementById('target-room-id-input').value.trim();
    if (!roomId) return;

    const token = localStorage.getItem('jwtToken');
    currentRoomId = roomId;

    initRealtimeSocket(token);

    socket.once('connect', () => {
        socket.emit('joinRoom', roomId);
    });

    const newUrl = `${window.location.origin}/?room=${roomId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    loginOverlay.style.display = "none";
    adminPanel.style.display = "none"; // Hide creation panel for voters
    if (roomIdBadge) {
        roomIdBadge.style.display = "block";
        roomIdBadge.innerText = `ROOM ID: ${roomId}`;
    }
};

// ==========================================
// 3. SOCKET WORKSPACE PIPELINE Orcherstration
// ==========================================

function initRealtimeSocket(authToken) {
    socket = io({
        auth: { token: authToken }
    });

    socket.on('updatePoll', (pollData) => {
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
                myVote = option;
                socket.emit('castVote', { roomId: currentRoomId, selectedOption: option });
            };
            
            displayOptionsContainer.appendChild(row);
        }
    });

    socket.on('voteError', (errMsg) => {
        alert(errMsg);
    });
}

// ==========================================
// 4. ELEMENT INTERACTION BINDINGS
// ==========================================

if (roomIdBadge) {
    roomIdBadge.onclick = async function() {
        const badgeText = this.innerText;
        if (!badgeText || badgeText.includes("None")) return;
        
        const roomId = badgeText.replace("ROOM ID:", "").trim();
        const inviteUrl = `${window.location.origin}/?room=${roomId}`;
        
        try {
            await navigator.clipboard.writeText(inviteUrl);
            alert(`🎉 Invite link copied successfully!\n\nShare link: ${inviteUrl}`);
        } catch (err) {
            alert(`Failed to copy. Link manually: ${inviteUrl}`);
        }
    };
}

if (addOptionBtn) {
    addOptionBtn.onclick = () => {
        const inputs = optionsInputsContainer.getElementsByTagName('input');
        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.className = 'option-input';
        newInput.placeholder = `Option ${inputs.length + 1}`;
        optionsInputsContainer.appendChild(newInput);
    };
}

if (submitPollBtn) {
    submitPollBtn.onclick = () => {
        const question = questionInput.value.trim();
        const inputElements = document.getElementsByClassName('option-input');
        
        let optionsArray = [];
        for (let input of inputElements) {
            if (input.value.trim() !== "") optionsArray.push(input.value.trim());
        }

        if (!question || optionsArray.length < 2) {
            alert("Please enter a question and at least 2 options.");
            return;
        }

        socket.emit('createPoll', { roomId: currentRoomId, question: question, options: optionsArray });
        myVote = null;
        questionInput.value = "";
        optionsInputsContainer.innerHTML = `
            <input type="text" class="option-input" placeholder="Option 1">
            <input type="text" class="option-input" placeholder="Option 2">
        `;
    };
}

// Hook global scope into internal inline toggle elements from your index.html
window.toggleAuthCard = (view) => {
    const loginCard = document.getElementById('login-card');
    const registerCard = document.getElementById('register-card');
    const adminCard = document.getElementById('admin-routing-card');
    const userCard = document.getElementById('user-routing-card');
    
    if (loginCard) loginCard.style.display = 'none';
    if (registerCard) registerCard.style.display = 'none';
    if (adminCard) adminCard.style.display = 'none';
    if (userCard) userCard.style.display = 'none';
    
    if (view === 'register' && registerCard) registerCard.style.display = 'block';
    else if (view === 'login' && loginCard) loginCard.style.display = 'block';
    else if (view === 'admin-hub' && adminCard) adminCard.style.display = 'block';
    else if (view === 'user-hub' && userCard) userCard.style.display = 'block';
};