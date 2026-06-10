const socket = io();

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

// 1. LOGIN FUNCTION
window.selectRole = (role) => {
    currentUserRole = role;
    
    // Remove the login screen view
    loginOverlay.style.display = "none";
    
    if (role === 'admin') {
        adminPanel.style.display = "block"; // Show creation form
        userAvatarTag.innerText = "A";
        chatTitleText.innerText = "Coding Chat (Admin Mode)";
    } else {
        userAvatarTag.innerText = "U";
        chatTitleText.innerText = "Coding Chat (User Mode)";
    }
};

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
submitPollBtn.onclick = () => {
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

    socket.emit('createPoll', { question: question, options: optionsArray });
    myVote = null;

    questionInput.value = "";
    optionsInputsContainer.innerHTML = `
        <input type="text" class="option-input" placeholder="Option 1">
        <input type="text" class="option-input" placeholder="Option 2">
    `;
};

// 3. SHARED REAL-TIME RECEIVER (Both user and admin run this)
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
        
        // Event interaction logic
        row.onclick = () => {
            myVote = option;
            socket.emit('castVote', option);
        };
        
        displayOptionsContainer.appendChild(row);
    }
});