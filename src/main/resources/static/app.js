const eventIcon = document.querySelector(".top-left-icon");
const secretChat = document.querySelector(".secret-chat");
const messages = ['♥유진님 사랑해♥', '♥정말루 사랑해♥', '♥세상에서 제일 사랑해♥'];
const secretMessage = secretChat.querySelector('.secret-chat-message');

if (eventIcon && secretChat) {
    eventIcon.addEventListener("click", (e) => {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        secretMessage.textContent = randomMsg;
        secretChat.hidden = !secretChat.hidden;
        e.stopPropagation();
    });

    secretChat.addEventListener("click", (e) => {
        e.stopPropagation();
    });
}

document.addEventListener("click", () => {
    if (secretChat && !secretChat.hidden) {
        secretChat.hidden = true;
    }
});
