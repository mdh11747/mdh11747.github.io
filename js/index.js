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
document.getElementById('userInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

async function sendMessage() {
    const userInput = document.getElementById('userInput').value;
    if (!userInput) return;

    const chatbox = document.getElementById('chatbox');
    chatbox.innerHTML += `<p><strong>User:</strong> ${userInput}</p>`;
    document.getElementById('userInput').value = '';

    try {
        const response = await fetch('https://morning-hollows-92414-17784c643d81.herokuapp.com/api/chat', { // Replace with your Heroku app URL
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: userInput })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        chatbox.innerHTML += `<p><strong>Assistant:</strong> ${data.content}</p>`;
        chatbox.scrollTop = chatbox.scrollHeight;
    } catch (error) {
        console.error('Error:', error);
        chatbox.innerHTML += `<p><strong>Assistant:</strong> Error fetching response</p>`;
    }
}

let lastScrollTop = 0; // Store the last scroll position

window.addEventListener('scroll', function () {
    const arrow1 = document.getElementById("arrow1");
    const arrow2 = document.getElementById("arrow2");
    const scrollHeight0 = 0;
    const scrollHeightVh1 = 90;
    const scrollHeight1 = window.innerHeight * (scrollHeightVh1 / 100);
    const div = document.getElementById("footer-content");
    const height = div.offsetHeight;
    const scrollHeight2 = scrollHeight1 + height - 38.5 - 21.44 - 5 - 37 - 7.38;

    const currentScroll = window.scrollY;

    if (currentScroll > lastScrollTop) {
        // Scrolling down
        if (currentScroll > 0 && currentScroll < scrollHeight1) {
            window.scrollTo({
                top: scrollHeight1,
                behavior: 'smooth'
            });
            arrow1.innerHTML = '&#8593';
        } else if (currentScroll > scrollHeight1 && currentScroll < scrollHeight2) {
            window.scrollTo({
                top: scrollHeight2,
                behavior: 'smooth'
            });
            arrow2.innerHTML = '&#8593';
        }
    } else {
        // Scrolling up
        if (currentScroll < scrollHeight2 && currentScroll >= scrollHeight1) {
            window.scrollTo({
                top: scrollHeight1 + 1,
                behavior: 'smooth'
            });
            arrow2.innerHTML = '&#8595';
            arrow1.innerHTML = '&#8593';
        } else if (currentScroll < scrollHeight1 && currentScroll > scrollHeight0) {
            window.scrollTo({
                top: scrollHeight0,
                behavior: 'smooth'
            });
            arrow1.innerHTML = '&#8595';
        }
    }

    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll; // For Mobile or negative scrolling
});