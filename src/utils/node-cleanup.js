//https://stackoverflow.com/questions/14031763/doing-a-cleanup-action-just-before-node-js-exits
function noOp() { }

// do app specific cleaning before exiting
process.on('exit', function () {
  process.emit('cleanup');
});

// catch ctrl+c event and exit normally
process.on('SIGINT', function () {
  console.log('Ctrl-C...');
  process.exit(2);
});

exports.Cleanup = function Cleanup(callback = noOp) {
  // attach user callback to the process event emitter
  // if no callback, it will still exit gracefully on Ctrl-C
  process.on('cleanup', callback);
};