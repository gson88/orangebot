import SteamID from 'steamid';

export default (steamid: string): string => {
  return new SteamID(String(steamid)).getSteamID64();
};
