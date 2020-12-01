module.exports = ChatMessageBubbleTemplate = ({ message, sig, type, identicon_color }, group) => {
  let style_html = type === "myself" ? '' : `style="background: ${identicon_color}"`;
  return `
    <div id="${sig}" class="chat-room-message chat-room-message-${type}" ${style_html}>
      <div class="chat-message-text">${message}</div>
    </div>
  `
}

