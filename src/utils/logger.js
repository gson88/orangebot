const appInfo = require('../../package.json');

module.exports = {
  log () {
    console.log(`\x1b[32mOrangeBot v${appInfo.version}:\x1b[0m`, ...arguments);
  },
  error () {
    console.error(`\x1b[32mOrangeBot v${appInfo.version}:\x1b[0m`, '\x1b[31mERROR:\x1b[0m', ...arguments);
  }
};