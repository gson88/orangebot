const SteamID = require('steamid');

module.exports = steamid => {
  return (new SteamID(String(steamid))).getSteamID64();
};