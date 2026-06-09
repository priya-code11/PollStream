const socket = io();

// HTML Elements for Creator Form
const questionInput = document.getElementById('poll-question-input');
const optionsInputsContainer = document.getElementById('dynamic-options-inputs');
const addOptionBtn = document.getElementById('add-option-btn');
const submitPollBtn = document.getElementById('submit-poll-btn');

// HTML Elements for Active Poll Display
const displayQuestion = document.getElementById('display-question');
const displayOptionsContainer = document.getElementById('display-options');

// --- 1. CREATING THE POLL (Frontend UI Magic) ---

// Click "+ Add Another Option" to spawn a new input text box
addOptionBtn.onclick = () => {
    const optionCount = optionsInputsContainer.getElementsByTagName('input').length + 1;
    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.className = 'option-input';
    newInput.placeholder = `Option ${optionCount}`;
    optionsInputsContainer.appendChild(newInput);
};

// Click "Launch Poll" to gather text values and send them to backend
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

    // Emit the custom question and options to the backend
    socket.emit('createPoll', { question: question, options: optionsArray });
    
    // Clear the creator inputs for next time
    questionInput.value = "";
    optionsInputsContainer.innerHTML = `
        <input type="text" class="option-input" placeholder="Option 1">
        <input type="text" class="option-input" placeholder="Option 2">
    `;
};

// --- 2. RECEIVING AND RENDERING THE POLL (Real-Time) ---

// Listen for updates from the server
socket.on('updatePoll', (pollData) => {
    if (!pollData) return;

    // Display the question
    displayQuestion.innerText = pollData.question;
    displayOptionsContainer.innerHTML = ''; 

    // Calculate total votes to show percentages if you want later, 
    // but for now let's just show counts
    for (const [option, votes] of Object.entries(pollData.options)) {
        const button = document.createElement('button');
        button.className = 'btn-vote';
        button.innerHTML = `<span>${option}</span> <strong>${votes} votes</strong>`;
        
        // When someone clicks a live option button
        button.onclick = () => {
            socket.emit('castVote', option);
        };
        
        displayOptionsContainer.appendChild(button);
    }
});