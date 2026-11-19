// Computer player in a worker, so the board stays responsive while it thinks.
// Message in:  { id, fen, moves: ['e2e4', …], level }   (start position and the moves of the game)
// Message out: { id, uci, depth, nodes, ms } or { id, error: 'code' }
importScripts('engine.js');
self.onmessage = e => {
  const { id, fen, moves, level } = e.data || {};
  try {
    const r = Chess.think(fen, moves, { level });
    self.postMessage(r ? { id, uci: r.uci, depth: r.depth, nodes: r.nodes, ms: r.ms } : { id, error: 'no_moves' });
  } catch (err) {
    self.postMessage({ id, error: err && err.message === 'illegal' ? 'illegal' : 'failed' });
  }
};
