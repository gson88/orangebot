const appInfo = require('../../package.json');
const { green, yellow, red } = require('colors/safe');

const appName = green(`OrangeBot v${appInfo.version}:`);

const Logger = {
  isVerbose: false,
  log () {
    console.log(appName, ...arguments);
  },
  warning () {
    console.log(appName, yellow('WARNING:'), ...arguments);
  },
  error () {
    console.error(appName, red('ERROR:'), ...arguments);
  },
  verbose () {
    if (this.isVerbose) {
      console.log(appName, ...arguments);
    }
  }
};

Logger.log.bind(Logger);
Logger.error.bind(Logger);
Logger.warning.bind(Logger);
Logger.verbose.bind(Logger);

module.exports = Logger;