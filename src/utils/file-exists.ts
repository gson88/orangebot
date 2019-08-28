import fs from 'fs';

export default function getMissingFiles(filenames: string[]) {
  return filenames.filter(filename => !fs.existsSync(filename));
}
