"use strict";
exports.__esModule = true;
var minimist = require('minimist');
var filesExist = require('./utils/file-exists');
var app_1 = require("./app");
var Logger = require('./utils/logger');
var defaultConfigFilepath = './config.json';
(function (args) {
    var configFilepath = parseAndVerifyArgs(args.slice(2));
    var config = require(configFilepath);
    var missingFiles = checkGameConfigFiles(config);
    if (missingFiles.length > 0) {
        Logger.error('One or more game config file(s) did not exist:', missingFiles);
        process.exit(1);
    }
    app_1["default"].run(config);
})(process.argv);
function parseAndVerifyArgs(args) {
    var parsedArgs = minimist(args.slice(2));
    if (parsedArgs.h) {
        printHelp();
        process.exit(0);
    }
    if (parsedArgs.d) {
        Logger.isVerbose = true;
    }
    var configFilepath = parsedArgs.i;
    if (!parsedArgs.i) {
        configFilepath = defaultConfigFilepath;
    }
    else if (parsedArgs.i === true) {
        configFilepath = defaultConfigFilepath;
        Logger.warning('You did not specify a config file after the argument -i');
        Logger.warning('Will try to use default config file', defaultConfigFilepath);
    }
    if (!filesExist([configFilepath])) {
        Logger.error('Config file not found:', configFilepath);
        process.exit(1);
    }
    return configFilepath;
}
function checkGameConfigFiles(config) {
    var configFileNames = Object.keys(config.gameConfigs).map(function (configName) { return config.gameConfigs[configName]; });
    var missingFiles = filesExist.getMissingFiles(configFileNames);
    return missingFiles;
}
function printHelp() {
    var appInfo = require('../package.json');
    console.log('Usage:               node orangebot.js [-i ./filename.json] [-h] [-d]');
    console.log('Alternative usage:   npm run start -- [-i ./filename.json] [-h] [-d]');
    console.log('Dev (nodemon):       npm run dev -- [-i ./filename.json] [-h]');
    console.log("Description:         " + appInfo.description);
    console.log("GitHub:              " + appInfo.repository.url);
    console.log();
    console.log('Arguments:');
    console.log(' -i filename.json           Set the json file to use');
    console.log(' -h                         See this help');
    console.log(' -d                         Verbose logging (Default on in dev)');
    console.log();
    console.log("For further documentation, visit our GitHub wiki: " + appInfo.repository.url + "/wiki");
    process.exit();
}
