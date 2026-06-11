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

// App States
let currentUserRole = null; // 'admin' or 'user'
let myVote = null;

// NEW: AUTHENTICATED LOGIN DISPATCH ROUTE
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
        loginOverlay.style.display = "none";

        if (currentUserRole === 'admin') {
            if (adminPanel) adminPanel.style.display = "block";
            if (userAvatarTag) userAvatarTag.innerText = "A";
            if (chatTitleText) chatTitleText.innerText = `${data.name} (Admin Mode)`;
        } else {
            if (adminPanel) adminPanel.style.display = "none"; // Hide admin tools for regular users
            if (userAvatarTag) userAvatarTag.innerText = "U";
            if (chatTitleText) chatTitleText.innerText = `${data.name} (User Mode)`;
        }

        // INITIALIZE LIVE SECURE REAL-TIME PIPELINE AFTER AUTHENTICATION
        initRealtimeSocket(data.token);

    } catch (err) {
        console.error("Frontend Login Error:", err);
        alert("Error establishing authorization handshake connection: " + err.message);
    }
};

function initRealtimeSocket(authToken) {
    // Pass JWT token validation string using options parameters
    socket = io({
        auth: { token: authToken }
    });

    // 3. SHARED REAL-TIME RECEIVER 
    socket.on('updatePoll', (pollData) => {
        if (!pollData) return;

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
                socket.emit('castVote', option);
            };
            
            displayOptionsContainer.appendChild(row);
        }
    });
    socket.on('voteError', (errMsg) => {
        alert(errMsg);
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

    socket.emit('createPoll', { question: question, options: optionsArray });
    myVote = null;

    questionInput.value = "";
    optionsInputsContainer.innerHTML = `
        <input type="text" class="option-input" placeholder="Option 1">
        <input type="text" class="option-input" placeholder="Option 2">
    `;
};

