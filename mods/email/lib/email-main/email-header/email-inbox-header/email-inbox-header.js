const EmailBarsMenuTemplate = require('../../../email-sidebar/email-bars-menu.template');
const EmailInboxHeaderTemplate = require('./email-inbox-header.template');

module.exports = EmailInboxHeader = {

  render(app, mod) {
    document.querySelector('.email-header').innerHTML = EmailInboxHeaderTemplate(app, mod);
  },

  attachEvents(app, mod) {

    document.getElementById('email-select-icon')
            .addEventListener('click', (e) => {
              Array.from(document.getElementsByClassName('email-selected')).forEach(checkbox => {
                checkbox.checked = e.currentTarget.checked;
              });
            });

    document.getElementById('email-delete-icon')
            .addEventListener('click', (e) => {
              let email_list = document.querySelector('.email-list');
              Array.from(document.getElementsByClassName('email-message')).forEach(mail => {
                let is_checked = mail.children[0].checked;

                // remove from DOM
                if (is_checked) {
                  email_list.removeChild(mail);
                  //
                  // tell our email to purge this transaction
                  //
                  let mysig = mail.id;
                  for (let i = 0; i < mod.emails[mod.emails.active].length; i++) {
                    let mytx = mod.emails[mod.emails.active][i];
                    if (mytx.transaction.sig == mysig) {
                      mod.deleteTransaction(mytx);
                    }
                  }
                }

              });
            });

    document.getElementById('email-bars-icon')
            .addEventListener('click', (e) => {
                let email_bars_menu = document.querySelector('#mobile.email-bars-menu');
                if (email_bars_menu != null) {
                    email_bars_menu.style.display = email_bars_menu.style.display == "block" ? "none" : "block";
                } else {
                    email_bars_menu = document.createElement('DIV');
                    email_bars_menu.classList.add('email-bars-menu');
                    email_bars_menu.id = "mobile"
                    email_bars_menu.style.display = "block";
                    email_bars_menu.innerHTML = EmailBarsMenuTemplate();
		    let mods = app.modules.respondTo("email-appspace");
                    for (let i = 0; i < mods.length; i++) {
                      if (mods[i].respondTo("email-appspace") != null) {
                        let mobile_email_apps = email_bars_menu.querySelector(".email-apps")
                        mobile_email_apps.innerHTML
                            += `<li class="email-apps-item" id="${i}">${mods[i].name}</li>`;
                      }
                    }
                    document.querySelector('body').append(email_bars_menu);
                    EmailBarsMenu.attachEvents(app, mod);
                    // extend functionatliy for mobile menu

                    email_bars_menu.addEventListener('click', () => {
                        email_bars_menu.style.display = "none";
                    });

                    window.addEventListener('click', (e) => {
                        if (e.target.id !== "email-bars-icon") {
                            email_bars_menu.style.display = "none";
                        }
                    });

                }
            });
  },
}
