const ModalAddUserTemplate = require('./modal-add-user.template');
const ModalAddUserConfirmTemplate = require('./modal-add-user-confirm.template');
const SaitoOverlay = require('./../saito-overlay/saito-overlay');

const InviteFriendsQR = require('./invite-friends-qr');
const InviteFriendsTemplate = require('./invite-friends.template.js');
const InviteFriendsLinkTemplate = require('./invite-friends-link.template');
const InviteFriendsPublickeyTemplate = require('./invite-friends-publickey.template');

function stopVideo() {
  let video = document.querySelector('video')
  if (video) { video.srcObject.getTracks().forEach(track => track.stop()); }
}

class ModalAddUser {

    constructor(app) {
      this.app = app;
    }

    render(app, mod) {

      mod.modal_overlay = new SaitoOverlay(app);
      mod.modal_overlay.render(app, mod);
      mod.modal_overlay.attachEvents(app, mod);

      if (!document.querySelector(".add-user")) { 
        mod.modal_overlay.showOverlay(app, mod, ModalAddUserTemplate());
      }

    }

    attachEvents(app, mod) {

      const startKeyExchange = async (publickey) => {

console.log("pkey: " + publickey);
        
        let doInitiate = (pubkey) => {
          try {
            let encrypt_mod = app.modules.returnModule('Encrypt');
            encrypt_mod.initiate_key_exchange(pubkey);
console.log("done initiate key exchange");
            mod.modal_overlay.showOverlay(app, mod, ModalAddUserConfirmTemplate());
            document.querySelector("#confirm-box").onclick = () => {
              mod.modal_overlay.hideOverlay();
            }  
          } catch(err) {
console.log(JSON.stringify(err));
            salert("Address is not a valid Saito Address");
          }
          
        }
        
        if (!app.crypto.isPublicKey(publickey)) {
          publickey = await app.keys.fetchPublicKey(publickey, doInitiate);
        } else {
          doInitiate(publickey);
        }
      }

      document.querySelector('.tutorial-skip').onclick = () => {
        stopVideo();
        mod.modal_overlay.hideOverlay();
      }

      document.querySelector('.generate-link-box').onclick = () => {
        document.querySelector('.welcome-modal-left').innerHTML = InviteFriendsLinkTemplate(app);
        document.querySelector('.link-space').addEventListener('click', (e) => {
          let text = document.querySelector('.share-link');
          text.select();
          document.execCommand('copy');
        });
      }

      document.querySelector('.scanqr-link-box').onclick = () => {
        let qrscanner = app.modules.returnModule("QRScanner");
        if (qrscanner) { qrscanner.startScanner(); }
//      data.stopVideo = stopVideo;
//      data.startKeyExchange = startKeyExchange;
//      InviteFriendsQR.render(app, data);
//      InviteFriendsQR.attachEvents(app, data);
    }

    document.querySelector('.address-link-box').onclick = () => {
      document.querySelector('.welcome-modal-left').innerHTML = InviteFriendsPublickeyTemplate(app);
      document.getElementById('add-contact-btn').onclick = () => {
        let publickey = document.getElementById('add-contact-input').value;
console.log("VALUE: " + publickey);
        startKeyExchange(publickey);
      };
    }

  }

}

module.exports = ModalAddUser


