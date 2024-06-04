document.addEventListener('DOMContentLoaded', function() {
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
