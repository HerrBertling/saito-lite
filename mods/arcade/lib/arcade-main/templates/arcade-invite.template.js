
module.exports = ArcadeInviteTemplate = (app, mod, invite, idx) => {

//console.log(JSON.stringify(invite.returnMessage()));

  let inviteTypeClass = "open-invite";
  let game_initialized = 0;
  if (invite.isMine) { inviteTypeClass = "my-invite"; }
  if (invite.msg) {
    if (invite.msg.options['game-wizard-players-select'] == invite.msg.players.length) {
      game_initialized = 1;
    }
  }
  let playersNeeded = invite.msg.players_needed > 4 ? 5: invite.msg.players_needed;
  let playersHtml = `<div class="playerInfo" style="">`;
  for (let i = 0; i < invite.msg.players_needed; i++) {
    if (i < 4) {
      if (i < invite.msg.players.length) {
        let identicon = app.keys.returnIdenticon(invite.msg.players[i]);
        playersHtml += `<div class="player-slot tip id-${invite.msg.players[i]}"><img class="identicon" src="${identicon}"><div class="tiptext">${app.browser.returnAddressHTML(invite.msg.players[i])}</div></div>`;
      } else {
        playersHtml += `<div class="player-slot identicon-empty"></div>`;  
      }
    } else {
      playersHtml += `<div style="color:#f5f5f59c;margin-left:0.2em;" class="player-slot-ellipsis fas fa-ellipsis-h"></div>`;  
      break;
    }
  }
  playersHtml += '</div>';

  let inviteHtml = `
    <div id="invite-${invite.transaction.sig}" class="arcade-tile i_${idx} ${inviteTypeClass}" style="background-image: url(/${invite.msg.game}/img/arcade.jpg);">
      <div class="invite-tile-wrapper">
        <div class="game-inset-img" style="background-image: url(/${invite.msg.game}/img/arcade.jpg);"></div>
        <div class="invite-col-2">
          <div class="gameName">${invite.msg.game}</div>
          <div class="gamePlayers">${playersHtml}</div>
        </div>
        <div class="gameShortDescription">${makeDescription(app, invite)}</div>
	<div class="gameButtons">
    `;
     if (invite.isMine) {
       if (game_initialized == 1) { 
         inviteHtml += `<button data-sig="${invite.transaction.sig}" data-cmd="continue" class="button invite-tile-button">CONTINUE</button>`;
       }
       inviteHtml += `<button data-sig="${invite.transaction.sig}" data-cmd="cancel" class="button invite-tile-button">CANCEL</button>`;
     } else {
       inviteHtml += `<button data-sig="${invite.transaction.sig}" data-cmd="join" class="button invite-tile-button invite-tile-button-join">JOIN</button>`;
     }

  inviteHtml += `
        </div>
      </div>
    </div>
    `;

  return inviteHtml;
}



let makeDescription = (app, invite) => {
  let defaultDescription = "";
  let gameModule = app.modules.returnModule(invite.msg.game);
  if (gameModule) {
    let moduleDescriptionMaker = gameModule.respondTo("make-invite-description");  
    if (moduleDescriptionMaker) {
      defaultDescription = moduleDescriptionMaker.makeDescription(invite.msg);
      if (defaultDescription === undefined) { defaultDescription = ""; }
    }
  }
  if (defaultDescription == "") { return ""; }
  if (invite.msg) {
    if (invite.msg.description) {
      defaultDescription = invite.msg.description;
    }
  }
  return ('<div class="invite-description">'+defaultDescription+'</div>');
}
