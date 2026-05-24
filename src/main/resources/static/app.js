const eventIcon = document.querySelector(".top-left-icon");
const secretChat = document.querySelector(".secret-chat");
const secretChatClose = document.querySelector(".secret-chat-close");

if (eventIcon && secretChat) {
    eventIcon.addEventListener("click", () => {
        secretChat.hidden = !secretChat.hidden;
    });
}

if (secretChatClose && secretChat) {
    secretChatClose.addEventListener("click", () => {
        secretChat.hidden = true;
    });
}
