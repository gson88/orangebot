const parsedArgs = require('minimist')(process.argv.slice(2));
const filesExist = require('./utils/file-exists');
const orangebot = require('./orangebot');
const Logger = require('./utils/logger');
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
  
  let configFilepath = parsedArgs.i;
  if (!parsedArgs.i) {
    configFilepath = defaultConfigFilepath;
  } else if (parsedArgs.i === true) {
    configFilepath = defaultConfigFilepath;
    Logger.error('You did not specify a config file after the argument -i');
    Logger.error('Will try to use default config file', defaultConfigFilepath);
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
  console.log('Usage:             node orangebot.js [-i json] [-h]');
  console.log('Description:       OrangeBot v3.1.0 is a CS:GO matchmaking bot written in node.js.');
  console.log('GitHub:            https://github.com/dejavueakay/orangebot');
  console.log();
  console.log('Arguments:');
  console.log(' -i filename.json           Set the json file to use');
  console.log(' -h                         See this help');
  console.log();
  console.log('For further documentation, visit our GitHub wiki: https://github.com/dejavueakay/orangebot/wiki');
  process.exit();
}