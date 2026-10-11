/**
 * solver-worker.js — runs the cubejs Kociemba two-phase solver in a Web Worker.
 *
 * Why a worker? cubejs must build its move/pruning tables once (about 2–5 s),
 * and that would freeze the page if it ran on the main thread.
 *
 * This is a "classic" worker (not a module) because cubejs is a classic
 * script: loading it with importScripts defines a global `Cube`.
 *
 * Messages in:  { id, type: 'init' }  or  { id, type: 'solve', facelets }
 * Messages out: { id, type: 'ready' } | { id, type: 'solution', solution, ms } | { id, type: 'error', message }
 */
/* global importScripts, Cube */
importScripts('../vendor/cubejs/cube.js', '../vendor/cubejs/solve.js');

let tablesReady = false;

function ensureTables() {
  if (!tablesReady) {
    Cube.initSolver();
    tablesReady = true;
  }
}

self.onmessage = (event) => {
  const { id, type, facelets } = event.data;
  try {
    ensureTables();
    if (type === 'init') {
      self.postMessage({ id, type: 'ready' });
      return;
    }
    if (type === 'solve') {
      // cubejs expects a 54-char facelet string in U R F D L B order —
      // exactly the format produced by js/cube-state.js.
      const started = performance.now();
      const solution = Cube.fromString(facelets).solve();
      self.postMessage({ id, type: 'solution', solution, ms: performance.now() - started });
      return;
    }
    throw new Error(`Unknown message type: ${type}`);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String((error && error.message) || error) });
  }
};
