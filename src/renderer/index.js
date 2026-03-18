const { WASRTK } = require('./wasrtk');
const { initializeThemeManager } = require('./theme');

function bootstrap() {
  document.addEventListener('DOMContentLoaded', async () => {
    const app = new WASRTK();
    await initializeThemeManager(app);
  });
}

module.exports = {
  bootstrap
};
