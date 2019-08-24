import minimist from 'minimist';
import appInfo from '../package.json';
import getMissingFiles from './utils/file-exists';
import orangebot from './app';
import Logger from './utils/logger';
import { IConfig } from './types/types';

const defaultConfigFilepath = './config.json';

function printHelp() {
  console.log(
    'Usage:               node orangebot.js [-i ./filename.json] [-h] [-d]'
  );
  console.log(
    'Alternative usage:   npm run start -- [-i ./filename.json] [-h] [-d]'
  );
  console.log('Dev (nodemon):       npm run dev -- [-i ./filename.json] [-h]');
  console.log(`Description:         ${appInfo.description}`);
  console.log(`GitHub:              ${appInfo.repository.url}`);
  console.log();
  console.log('Arguments:');
  console.log(' -i filename.json           Set the json file to use');
  console.log(' -h                         See this help');
  console.log(
    ' -d                         Verbose logging (Default on in dev)'
  );
  console.log();
  console.log(
    `For further documentation, visit our GitHub wiki: ${appInfo.repository.url}/wiki`
  );
  process.exit();
}

function parseAndVerifyArgs(args: string[]) {
  const parsedArgs = minimist(args.slice(2));

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
    Logger.warning(
      'Will try to use default config file',
      defaultConfigFilepath
    );
  }

  if (getMissingFiles([configFilepath]).length > 0) {
    Logger.error('Config file not found:', configFilepath);
    process.exit(1);
  }

  return configFilepath;
}

function getMissingGameConfigFiles(config: IConfig) {
  const configFileNames = Object.keys(config.gameConfigs).map(
    configName => config.gameConfigs[configName]
  );

  return getMissingFiles(configFileNames);
}

(async args => {
  const configFilepath = parseAndVerifyArgs(args.slice(2));

  const config: IConfig = await import(configFilepath);
  const missingFiles = getMissingGameConfigFiles(config);

  if (missingFiles.length > 0) {
    Logger.error(
      'One or more game config file(s) did not exist:',
      missingFiles
    );
    process.exit(1);
  }

  orangebot.run(config);
})(process.argv);
