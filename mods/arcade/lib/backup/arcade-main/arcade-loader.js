const ArcadeLoaderTemplate = require('./arcade-loader.template');
const ArcadeLoadedTemplate = require('./arcade-loaded.template');

module.exports = ArcadeLoader = {

  render(app, data) {

    let arcade_main = document.querySelector(".arcade-main");
    if (!arcade_main) { return; }

    arcade_main.innerHTML = data.game_id == undefined || data.game_id == "" ?
      ArcadeLoaderTemplate() : ArcadeLoadedTemplate(data.game_id);

  },


  attachEvents(app, data) {

    if (data.game_id == "" || data.game_id == undefined) {

    } else {

      //
      // kick into init
      //
      document.querySelector(".start-game-btn")
        .addEventListener('click', (e) => {
          for (let i = 0; i < app.options.games.length; i++) {
            if (app.options.games[i].id == data.game_id) {
              app.options.games[i].ts = new Date().getTime();
              app.options.games[i].initialize_game_run = 0;
              app.storage.saveOptions();
	      for (let z = 0; z < app.modules.mods.length; z++) {
	        if (app.modules.mods[z].name == app.options.games[i].module) {
              	  window.location = '/' + app.modules.mods[z].returnSlug();
	  	  return;
	 	}
	      }
              break;
            }
          }
      });

    }
  }
}
