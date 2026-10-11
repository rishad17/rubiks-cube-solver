/**
 * solver.js — promise-based wrapper around the solver Web Worker.
 *
 * The solving itself is done by cubejs (Kociemba's two-phase algorithm).
 * This module adds the safety checks the app relies on:
 *   - an already-solved cube returns an empty solution (cubejs would
 *     otherwise return a pointless non-empty sequence);
 *   - every solution is re-applied with our own independent move model
 *     (cube-state.js) and rejected if it does not produce a solved cube.
 */

import { applyMoves, isSolvedFacelets, parseMoveSequence } from './cube-state.js';

const SOLVE_TIMEOUT_MS = 30000;

/**
 * Turn the raw solver output into a verified move list.
 * Throws if the moves do not solve `facelets`.
 */
export function verifiedSolution(facelets, rawSolution) {
  if (isSolvedFacelets(facelets)) return [];
  if (typeof rawSolution !== 'string' || !rawSolution.trim()) {
    throw new Error('The solver did not return a solution for this cube.');
  }
  const moves = parseMoveSequence(rawSolution);
  if (!isSolvedFacelets(applyMoves(facelets, moves))) {
    throw new Error('Safety check failed: the computed moves do not solve this cube. Please re-check your input.');
  }
  return moves;
}

export class CubeSolver {
  constructor(workerUrl = new URL('./solver-worker.js', import.meta.url)) {
    this.workerUrl = workerUrl;
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.readyPromise = null;
  }

  /** Start the worker and build the solver tables (only once). */
  init() {
    if (!this.readyPromise) {
      this.readyPromise = this.#request({ type: 'init' }).catch((error) => {
        this.readyPromise = null; // allow a retry
        throw error;
      });
    }
    return this.readyPromise;
  }

  /**
   * Solve a validated facelet string.
   * Resolves to { moves: string[], alreadySolved: boolean, ms: number }.
   */
  async solve(facelets) {
    if (isSolvedFacelets(facelets)) return { moves: [], alreadySolved: true, ms: 0 };
    await this.init();
    const reply = await this.#request({ type: 'solve', facelets }, SOLVE_TIMEOUT_MS);
    return { moves: verifiedSolution(facelets, reply.solution), alreadySolved: false, ms: reply.ms };
  }

  #ensureWorker() {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') throw new Error('This browser does not support Web Workers.');
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = (event) => {
      const { id, type, message } = event.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      if (type === 'error') entry.reject(new Error(`Solver error: ${message}`));
      else entry.resolve(event.data);
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.#failAll(new Error(
        'The solver could not be loaded. Make sure the page is served by a local web server '
        + '(not opened as a file://) and that the vendor/cubejs folder exists.',
      ));
    };
    return this.worker;
  }

  #request(message, timeoutMs = 0) {
    return new Promise((resolve, reject) => {
      let worker;
      try { worker = this.#ensureWorker(); } catch (error) { reject(error); return; }
      const id = this.nextId++;
      const entry = { resolve, reject, timer: null };
      if (timeoutMs) {
        entry.timer = setTimeout(() => {
          this.#failAll(new Error('The solver took too long and was stopped. Please try again.'));
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      worker.postMessage({ id, ...message });
    });
  }

  /** Reject every pending request and restart the worker on next use. */
  #failAll(error) {
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending.clear();
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.readyPromise = null;
  }
}
