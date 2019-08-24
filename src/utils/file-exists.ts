const fs = require('fs');

module.exports = (filenames: string[]) => {
  return getMissingFiles(filenames).length === 0;
};

function getMissingFiles(filenames: string[]) {
  return filenames.filter(filename => !fs.existsSync(filename));
}

module.exports.getMissingFiles = getMissingFiles;
