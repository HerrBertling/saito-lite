module.exports = GameMenuHudTemplate = (menu_items) => {
  return `
  <ul>${
    Object.entries(menu_items)
          .map(([key, value]) => `<li id="hud_menu_${key}"><a id="${key}">${value.name}</a></li>`)
          .join('')
  }</ul>`;
}
