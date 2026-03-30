const { WASRTK } = require('./wasrtk');
const { initializeThemeSync } = require('./theme');

function bootstrap() {
  document.addEventListener('DOMContentLoaded', async () => {
    new WASRTK();
    await initializeThemeSync();
  });
}

module.exports = {
  bootstrap,
};
