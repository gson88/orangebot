const fs = require('fs');

module.exports = filenames => {
  return getMissingFilenames(filenames).length === 0;
};

function getMissingFilenames (filenames) {
  return filenames.filter(filename => !fs.existsSync(filename));
}

module.exports.getMissingFiles = getMissingFilenames;