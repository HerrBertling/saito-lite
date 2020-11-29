module.exports = ChatNavTemplate = () => {

  return `<div id="chat-nav" class="chat-dropdown" style="display: none"><ul style="display: grid;grid-gap: 0.5em;" id="chat-navbar" class="chat-navbar"><li id="chat-nav-new-chat" class="chat-nav-row"><i class="far fa-comment"></i>Search</li></a><li id="chat-nav-add-contact" class="chat-nav-row"><i class="fas fa-user-plus"></i>Add Contact</li></a></ul>
      <div class="chat-nav-arrow"></div>
      <div class="chat-nav-arrow" id="chat-nav-arrow-interior"></div>
    </div>`;
}
