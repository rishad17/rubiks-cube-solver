// Tests for the logical cube model: move definitions, state transformations,
// and agreement with the independent cubejs implementation.
// Run with:  npm test   (or: node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  SOLVED_FACELETS, ALL_MOVES, applyMove, applyMoves, invertSequence, isSolvedFacelets,
  randomScramble, parseMoveSequence, moveAngle, FACELET_GEOMETRY, faceletIndexAt,
  colorsToFacelets, faceletsToColors,
} from '../js/cube-state.js';

const require = createRequire(import.meta.url);
const Cube = require('../vendor/cubejs/cube.js');

/** Deterministic pseudo-random generator so failures are reproducible. */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const faceOf = (facelets, face) => {
  const f = 'URFDLB'.indexOf(face);
  return facelets.slice(f * 9, f * 9 + 9);
};

test('solved cube is solved', () => {
  assert.equal(isSolvedFacelets(SOLVED_FACELETS), true);
});

test('every sticker has a unique 3D position/normal', () => {
  FACELET_GEOMETRY.forEach((g, i) => assert.equal(faceletIndexAt(g.position, g.normal), i));
});

test('each move applied four times is the identity; X X\' is the identity', () => {
  for (const move of ['U', 'R', 'F', 'D', 'L', 'B']) {
    assert.equal(applyMoves(SOLVED_FACELETS, [move, move, move, move]), SOLVED_FACELETS);
    assert.equal(applyMoves(SOLVED_FACELETS, [move, `${move}'`]), SOLVED_FACELETS);
    assert.equal(applyMoves(SOLVED_FACELETS, [`${move}2`, `${move}2`]), SOLVED_FACELETS);
    assert.equal(applyMoves(SOLVED_FACELETS, [move, move]), applyMove(SOLVED_FACELETS, `${move}2`));
  }
});

test('R moves the front right column up to the top (standard notation)', () => {
  const after = applyMove(SOLVED_FACELETS, 'R');
  // U right column (U2, U5, U8) now shows Front color.
  assert.deepEqual([2, 5, 8].map((i) => faceOf(after, 'U')[i]), ['F', 'F', 'F']);
  // F right column now shows Down color.
  assert.deepEqual([2, 5, 8].map((i) => faceOf(after, 'F')[i]), ['D', 'D', 'D']);
});

test('U moves the front top row to the left', () => {
  const after = applyMove(SOLVED_FACELETS, 'U');
  assert.equal(faceOf(after, 'L').slice(0, 3), 'FFF');
  assert.equal(faceOf(after, 'F').slice(0, 3), 'RRR');
});

test('F moves the bottom row of U onto the left column of R', () => {
  const after = applyMove(SOLVED_FACELETS, 'F');
  assert.deepEqual([0, 3, 6].map((i) => faceOf(after, 'R')[i]), ['U', 'U', 'U']);
});

test('L, D, B are clockwise seen from their own face', () => {
  // L: front left column goes DOWN.
  const l = applyMove(SOLVED_FACELETS, 'L');
  assert.deepEqual([0, 3, 6].map((i) => faceOf(l, 'D')[i]), ['F', 'F', 'F']);
  // D: front bottom row goes RIGHT.
  const d = applyMove(SOLVED_FACELETS, 'D');
  assert.equal(faceOf(d, 'R').slice(6), 'FFF');
  // B: top row of U goes to the LEFT face.
  const b = applyMove(SOLVED_FACELETS, 'B');
  assert.deepEqual([0, 3, 6].map((i) => faceOf(b, 'L')[i]), ['U', 'U', 'U']);
});

test('move angles: clockwise R/U/F are negative rotations about +axis, L/D/B positive', () => {
  assert.equal(moveAngle('R'), -Math.PI / 2);
  assert.equal(moveAngle("R'"), Math.PI / 2);
  assert.equal(moveAngle('L'), Math.PI / 2);
  assert.equal(Math.abs(moveAngle('U2')), Math.PI);
});

test('agrees with the cubejs model for 2000 random sequences (all 18 moves)', () => {
  const random = seededRandom(42);
  for (const move of ALL_MOVES) {
    assert.equal(applyMove(SOLVED_FACELETS, move), new Cube().move(move).asString(), `move ${move}`);
  }
  for (let k = 0; k < 2000; k++) {
    const scramble = randomScramble(1 + (k % 30), random);
    assert.equal(applyMoves(SOLVED_FACELETS, scramble), new Cube().move(scramble.join(' ')).asString());
  }
});

test('a scramble followed by its inverse returns to solved', () => {
  const random = seededRandom(7);
  for (let k = 0; k < 200; k++) {
    const scramble = randomScramble(25, random);
    const scrambled = applyMoves(SOLVED_FACELETS, scramble);
    assert.equal(isSolvedFacelets(scrambled), false);
    assert.equal(applyMoves(scrambled, invertSequence(scramble)), SOLVED_FACELETS);
  }
});

test('parseMoveSequence normalizes notation and rejects junk', () => {
  assert.deepEqual(parseMoveSequence("R  U’ F2\nD"), ['R', "U'", 'F2', 'D']);
  assert.deepEqual(parseMoveSequence(''), []);
  assert.throws(() => parseMoveSequence('R X'));
});

test('UI colors <-> facelet letters round trip (manual input mapping)', () => {
  const scrambled = applyMoves(SOLVED_FACELETS, "R U F' L2 D B'");
  const colors = faceletsToColors(scrambled);
  assert.equal(colors[4], 'white');   // U center
  assert.equal(colors[13], 'red');    // R center
  assert.equal(colors[22], 'green');  // F center
  assert.equal(colors[31], 'yellow'); // D center
  assert.equal(colors[40], 'orange'); // L center
  assert.equal(colors[49], 'blue');   // B center
  assert.equal(colorsToFacelets(colors), scrambled);
});
