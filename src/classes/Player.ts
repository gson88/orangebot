interface IPlayer {
  steamid: string;
  team: string;
  name: string;
  clantag: string;
}

class Player implements IPlayer {
  steamid: string;
  team: string;
  name: string;
  clantag: string;

  constructor(steamid: string, team: string, name: string, clantag: string) {
    this.steamid = steamid;
    this.team = team;
    this.name = name;
    this.clantag = clantag;
  }
}

module.exports = Player;
