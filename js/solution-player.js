/**
 * solution-player.js — steps forwards and backwards through a solution.
 *
 * `index` = number of moves already performed. The move the user should do
 * next is moves[index]. The logical facelet state is updated immediately on
 * every step and the matching face turn is queued on the 3D cube, so the two
 * can never drift apart. After animations settle, the 3D scene is read back
 * and compared with the logical state as an extra safety check.
 */
import {
  applyMove, applyMoves, colorsToFacelets, faceletsToColors, invertMove, isSolvedFacelets,
} from './cube-state.js';

export class SolutionPlayer {
  /**
   * @param {import('./cube3d.js').Cube3D} cube3d
   * @param {(state: object) => void} onUpdate called whenever anything changes
   */
  constructor(cube3d, onUpdate) {
    this.cube3d = cube3d;
    this.onUpdate = onUpdate;
    this.initialFacelets = null;
    this.moves = [];
    this.index = 0;
    this.facelets = null;
    this.playing = false;
    this.displayVerifiedSolved = false;
  }

  load(initialFacelets, moves) {
    this.pause();
    this.initialFacelets = initialFacelets;
    this.moves = [...moves];
    this.restart();
  }

  unload() {
    this.pause();
    this.moves = [];
    this.initialFacelets = null;
  }

  get isLoaded() { return this.initialFacelets !== null; }
  get isComplete() { return this.isLoaded && this.index === this.moves.length; }
  get currentMove() { return this.moves[this.index] ?? null; }

  /** Perform the next move (animated). */
  next() {
    if (!this.isLoaded || this.index >= this.moves.length) return false;
    const move = this.moves[this.index];
    this.index++;
    this.#step(move);
    return true;
  }

  /** Undo the last performed move (animated, turning the face back). */
  previous() {
    if (!this.isLoaded || this.index === 0) return false;
    this.pause();
    this.index--;
    this.#step(invertMove(this.moves[this.index]));
    return true;
  }

  /** Go back to the original entered scramble without animation. */
  restart() {
    this.pause();
    this.goTo(0);
  }

  /** Jump to the state after `index` moves (no animation). */
  goTo(index) {
    if (!this.isLoaded) return;
    this.index = Math.max(0, Math.min(index, this.moves.length));
    this.facelets = applyMoves(this.initialFacelets, this.moves.slice(0, this.index));
    this.cube3d.setColors(faceletsToColors(this.facelets));
    this.#afterChange(true);
  }

  /** Automatically perform the remaining moves one after another. */
  async play() {
    if (!this.isLoaded || this.playing) return;
    if (this.isComplete) this.goTo(0);
    this.playing = true;
    this.onUpdate(this.state);
    while (this.playing && this.next()) {
      await this.cube3d.whenIdle();
      await new Promise((r) => setTimeout(r, 220));
    }
    this.playing = false;
    this.onUpdate(this.state);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.onUpdate?.(this.state);
  }

  get state() {
    return {
      moves: this.moves,
      index: this.index,
      total: this.moves.length,
      currentMove: this.currentMove,
      complete: this.isComplete,
      playing: this.playing,
      logicallySolved: this.facelets ? isSolvedFacelets(this.facelets) : false,
      displayVerifiedSolved: this.displayVerifiedSolved,
    };
  }

  #step(move) {
    this.facelets = applyMove(this.facelets, move);
    const expected = this.facelets;
    this.displayVerifiedSolved = false;
    this.onUpdate(this.state);
    this.cube3d.animateMove(move).then(() => {
      // Only verify once the user has stopped clicking and the queue is empty.
      if (!this.cube3d.isAnimating && this.facelets === expected) this.#afterChange(false);
    });
  }

  /** Compare the 3D scene with the logical state; resync if they ever differ. */
  #afterChange(alreadySynced) {
    if (!alreadySynced) {
      const shown = this.cube3d.readColors().join(',');
      const expected = faceletsToColors(this.facelets).join(',');
      if (shown !== expected) {
        console.warn('3D cube was out of sync with the logical state; resynchronizing.');
        this.cube3d.setColors(faceletsToColors(this.facelets));
      }
    }
    // "Solved" is confirmed from what the 3D scene actually shows.
    this.displayVerifiedSolved = this.isComplete
      && isSolvedFacelets(colorsToFacelets(this.cube3d.readColors()));
    this.onUpdate(this.state);
  }
}
