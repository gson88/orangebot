import SteamID from 'steamid';

module.exports = (steamid: string): string => {
  return new SteamID(String(steamid)).getSteamID64();
};
