document.addEventListener('DOMContentLoaded', function () {
    const lines = document.querySelectorAll('#terminal-text p');

    function typeLine(line, delay) {
        const textLength = line.textContent.length;
        const typingDuration = textLength * 100; // Adjust speed (100ms per character)
        const lineWidth = line.scrollWidth; // Get the natural width of the line

        // Setting width before starting the animation to ensure it doesn't expand beyond the text
        line.style.width = `${lineWidth}px`;

        setTimeout(() => {
            line.classList.add('typing');
            line.style.visibility = 'visible'; // Make it visible when typing starts
            line.style.animation = `typing ${typingDuration}ms steps(${textLength}, end) forwards, blink-caret 0.75s step-end infinite`;

            setTimeout(() => {
                line.classList.remove('typing');
                line.style.borderRight = 'none'; // Remove blinking cursor
                line.style.animation = ''; // Reset animation

                const nextLine = line.nextElementSibling;
                if (nextLine) {
                    typeLine(nextLine, 500); // Typing next line after a short delay
                }
            }, typingDuration); // Duration of typing animation
        }, delay);
    }

    // Start the typing animation for the first line
    if (lines.length > 0) {
        typeLine(lines[0], 0);
    }
});

document.getElementById('sendButton').addEventListener('click', sendMessage);
document.getElementById('userInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

async function sendMessage() {
    const userInput = document.getElementById('userInput').value;
    if (!userInput) return;

    const chatbox = document.getElementById('chatbox');
    chatbox.innerHTML += `<p><strong>You:</strong> ${userInput}</p>`;
    document.getElementById('userInput').value = '';

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer sk-proj-z4cYy79eG2WmbUE9CZAVT3BlbkFJmY7sEPHUqvKnYBHXg3b2`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',  // Ensure the correct model is specified
                messages: [
                    { role: 'user', content: userInput }
                ],
                stop: null,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error Data:', errorData); // Log detailed error response
            if (errorData.error && errorData.error.message) {
                throw new Error(`API error: ${errorData.error.message}`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        }

        const data = await response.json();
        console.log('API Response:', data); // Log the response for debugging
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            const botResponse = data.choices[0].message.content.trim();
            chatbox.innerHTML += `<p><strong>Bot:</strong> ${botResponse}</p>`;
        } else {
            console.error('Unexpected API response format:', data);
            chatbox.innerHTML += `<p><strong>Bot:</strong> Unexpected response format</p>`;
        }
        chatbox.scrollTop = chatbox.scrollHeight;
    } catch (error) {
        console.error('Error:', error);
        chatbox.innerHTML += `<p><strong>Bot:</strong> ${error.message}</p>`;
    }
}