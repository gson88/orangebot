const cleanupCallbacks: Function[] = [];

// do app specific cleaning before exiting
process.on('exit', function() {
  cleanupCallbacks.map(cb => cb());
});

// catch ctrl+c event and exit normally
process.on('SIGINT', function() {
  console.log('Ctrl-C...');
  process.exit(2);
});

export function Cleanup(callback: Function) {
  cleanupCallbacks.push(callback);
}
