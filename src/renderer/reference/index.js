const settings = require('./settings');
const imageMode = require('./modes/image');
const screenCaptureMode = require('./modes/screen-capture');

module.exports = {
  ...settings,
  ...imageMode,
  ...screenCaptureMode
};
