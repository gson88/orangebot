const parsedArgs = require('minimist')(process.argv.slice(2));
const filesExist = require('./src/utils/file-exists');
const orangebot = require('./src/app');
const Logger = require('./src/utils/logger');

const defaultConfigFilepath = './config.json';
const configFilepath = parseAndVerifyArgs();
const config = require(configFilepath);

checkGameConfigFiles(config);
orangebot.run(config);

function parseAndVerifyArgs () {
  if (parsedArgs.h) {
    printHelp();
    process.exit(0);
  }

  if (parsedArgs.d) {
    Logger.isVerbose = true;
  }

  let configFilepath = parsedArgs.i;
  if (!parsedArgs.i) {
    configFilepath = defaultConfigFilepath;
  } else if (parsedArgs.i === true) {
    configFilepath = defaultConfigFilepath;
    Logger.warning('You did not specify a config file after the argument -i');
    Logger.warning('Will try to use default config file', defaultConfigFilepath);
  }

  if ( !filesExist([ configFilepath ]) ) {
    Logger.error('Config file not found:', configFilepath);
    process.exit(1);
  }

  return configFilepath;
}

function checkGameConfigFiles (config) {
  const configFileNames = Object.keys(config.gameConfigs).map(configName => config.gameConfigs[configName]);
  const missingFiles = filesExist.getMissingFiles(configFileNames);

  if (missingFiles.length > 0) {
    Logger.error('One or more game config file(s) did not exist:', missingFiles);
    process.exit(1);
  }
}

function printHelp() {
  const appInfo = require('./package.json');
  console.log('Usage:               node orangebot.js [-i ./filename.json] [-h] [-d]');
  console.log('Alternative usage:   npm run start -- [-i ./filename.json] [-h] [-d]');
  console.log('Dev (nodemon):       npm run dev -- [-i ./filename.json] [-h]');
  console.log(`Description:         ${appInfo.description}`);
  console.log(`GitHub:              ${appInfo.repository.url}`);
  console.log();
  console.log('Arguments:');
  console.log(' -i filename.json           Set the json file to use');
  console.log(' -h                         See this help');
  console.log(' -d                         Verbose logging (Default on in dev)');
  console.log();
  console.log(`For further documentation, visit our GitHub wiki: ${appInfo.repository.url}/wiki`);
  process.exit();
}