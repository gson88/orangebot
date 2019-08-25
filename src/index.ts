import { resolve } from 'path';
import minimist from 'minimist';
import appInfo from '../package.json';
import getMissingFiles from './utils/file-exists';
import orangebot from './app';
import Logger from './utils/logger';
import { IConfig, IGameConfigs } from './types/types';

const defaultConfigFilepath = 'config.json';

function printHelp() {
  console.log(
    'Usage:               node {appDir}/index.js [-i ./config-filename.json] [-h] [-d]'
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

  let configFilepath;
  if (!parsedArgs.i) {
    configFilepath = defaultConfigFilepath;
  } else if (parsedArgs.i === true) {
    configFilepath = defaultConfigFilepath;
    Logger.warning('You did not specify a config file after the argument -i');
    Logger.warning(
      'Will try to use default config file',
      defaultConfigFilepath
    );
  } else {
    configFilepath = parsedArgs.i;
  }

  const defaultConfigFullPath = resolve(process.cwd(), configFilepath);

  if (getMissingFiles([defaultConfigFullPath]).length > 0) {
    Logger.error('Config file not found:', defaultConfigFullPath);
    process.exit(1);
  }

  return configFilepath;
}

function getMissingGameConfigFiles(gameConfigFiles: IGameConfigs) {
  const configFileNames = Object.keys(gameConfigFiles).map(configName =>
    resolve(process.cwd(), './cfg/', gameConfigFiles[configName])
  );

  return getMissingFiles(configFileNames);
}

(async args => {
  const configFilepath = parseAndVerifyArgs(args.slice(2));

  const config: IConfig = await import(resolve(process.cwd(), configFilepath));
  const missingFiles = getMissingGameConfigFiles(config.gameConfigs);
  if (missingFiles.length > 0) {
    Logger.error(
      `${missingFiles} game config file(s) did not exist. Missing files:`,
      missingFiles
    );
    process.exit(1);
  }

  orangebot.run(config);
})(process.argv);
