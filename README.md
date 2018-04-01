# OrangeBot v4.0.0
OrangeBot is a CS:GO matchmaking bot written in node.js. It uses a logaddress and rcon to execute server commands based on chat !commands. This means it works on a vanilla CS:GO server.

## Quick Start

You can either run the code directly with node (recommended):
```
npm install
npm run start
```
Or use our precompiled binaries:
```
./orangebot
```
You can start a BO3 match with `!start de_dust2 de_cache de_mirage` in game chat. Both teams have to `!ready` once to start the match. A knife round will start before each map. Players can `!pause` the game on next freezetime if they want to.


## Documentation

Visit our [Github Wiki](https://github.com/dejavueakay/orangebot/wiki) for a full documentation:

* [How to install OrangeBot 4.0.0](https://github.com/dejavueakay/orangebot/wiki/Installation)
* [How to configure the bot (config.json)](https://github.com/dejavueakay/orangebot/wiki/Settings)
* [How to use the bot In-game](https://github.com/dejavueakay/orangebot/wiki/In-game-!commands)

## Credits

Credits go to:

* [Dregu](https://github.com/Dregu) for writing an awesome bot! Yay! (OrangeBot v1.0)
* [JamesCullum](https://github.com/JamesCullum) for contributing, implementing and fixing stuff! (OrangeBot v2.0)
* [dejavueakay](https://github.com/dejavueakay) for contributing, implementing and fixing stuff! (OrangeBot v3.0)

## License

See the LICENSE file for further information. Copyright (c) 2015 Dregu, MIT License.
