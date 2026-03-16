const { WASRTK } = require('./wasrtk');

function bootstrap() {
  document.addEventListener('DOMContentLoaded', () => {
    new WASRTK();
  });
}

module.exports = {
  bootstrap
};
