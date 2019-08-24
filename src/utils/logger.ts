import appInfo from '../../package.json';
import { green, yellow, red } from 'colors/safe';

const appName = green(`OrangeBot v${appInfo.version}:`);

const Logger = {
  isVerbose: false,
  log(...args) {
    console.log(appName, ...args);
  },
  warning(...args) {
    console.warn(appName, yellow('WARNING:'), ...args);
  },
  error(...args) {
    console.error(appName, red('ERROR:'), ...args);
  },
  verbose(...args) {
    if (this.isVerbose) {
      console.log(appName, ...args);
    }
  }
};

export default Logger;
