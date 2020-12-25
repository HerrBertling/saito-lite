const AppStorePublishSuccessTemplate = require('./appstore-publish-success.template');

module.exports = AppStorePublishSuccess = {
  render(app, data) {
    document.querySelector(".email-appspace")
            .innerHTML = AppStorePublishSuccessTemplate();
  },

  attachEvents(app, data) {},
}