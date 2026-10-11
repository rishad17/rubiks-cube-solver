// Tests for cube validation and for the full solve pipeline
// (UI colors -> validation -> solver format -> cubejs -> verified moves).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  SOLVED_FACELETS, applyMoves, faceletsToColors, isSolvedFacelets, randomScramble,
} from '../js/cube-state.js';
import { validateCube, permutationParity } from '../js/cube-validation.js';
import { verifiedSolution } from '../js/solver.js';

const require = createRequire(import.meta.url);
const Cube = require('../vendor/cubejs/cube.js');
require('../vendor/cubejs/solve.js');

/** Return a copy of a facelet string with stickers moved: newString[to] = old[from]. */
function permuteStickers(facelets, pairs) {
  const chars = [...facelets];
  for (const [to, from] of pairs) chars[to] = facelets[from];
  return chars.join('');
}

const codes = (result) => result.errors.map((e) => e.code);

// Facelet indices (U=0..8, R=9..17, F=18..26, D=27..35, L=36..44, B=45..53)
const U8 = 7, F2 = 19, U6 = 5, R2 = 10, U9 = 8, R1 = 9, F3 = 20, D2 = 28, U3 = 2, B1 = 45, R3 = 11;
const F6 = 23, R4 = 12;

test('solved cube is valid', () => {
  const result = validateCube(faceletsToColors(SOLVED_FACELETS));
  assert.equal(result.valid, true);
  assert.equal(result.facelets, SOLVED_FACELETS);
});

test('incomplete input is rejected', () => {
  const colors = faceletsToColors(SOLVED_FACELETS);
  colors[0] = null;
  colors[10] = null;
  const result = validateCube(colors);
  assert.equal(result.valid, false);
  assert.deepEqual(codes(result), ['incomplete']);
  assert.match(result.errors[0].message, /2 stickers are still empty/);
});

test('wrong color counts are rejected', () => {
  const colors = faceletsToColors(SOLVED_FACELETS);
  colors[0] = 'yellow'; // 8 white, 10 yellow
  const result = validateCube(colors);
  assert.deepEqual(codes(result), ['color-count']);
  assert.match(result.errors[0].message, /white: 8.*yellow: 10/);
});

test('flipped edge is rejected', () => {
  const facelets = permuteStickers(SOLVED_FACELETS, [[U8, F2], [F2, U8]]);
  assert.deepEqual(codes(validateCube(faceletsToColors(facelets))), ['edge-flip']);
});

test('twisted corner is rejected', () => {
  // Rotate the three stickers of the URF corner.
  const facelets = permuteStickers(SOLVED_FACELETS, [[U9, R1], [R1, F3], [F3, U9]]);
  assert.deepEqual(codes(validateCube(faceletsToColors(facelets))), ['corner-twist']);
});

test('two swapped edges are rejected (parity)', () => {
  // Exchange the UF and UR edges.
  const facelets = permuteStickers(SOLVED_FACELETS, [[U8, U6], [F2, R2], [U6, U8], [R2, F2]]);
  const result = validateCube(faceletsToColors(facelets));
  assert.deepEqual(codes(result), ['parity']);
  assert.match(result.errors[0].message, /two pieces appear to be swapped/);
});

test('swapping two corners AND two edges is a valid (solvable) state', () => {
  const facelets = permuteStickers(SOLVED_FACELETS, [
    [U8, U6], [F2, R2], [U6, U8], [R2, F2],                        // UF <-> UR
    [U9, U3], [R1, B1], [F3, R3], [U3, U9], [B1, R1], [R3, F3],    // URF <-> UBR
  ]);
  assert.equal(validateCube(faceletsToColors(facelets)).valid, true);
});

test('edge with opposite colors is rejected', () => {
  // UF becomes white-yellow, DF becomes green-green.
  const facelets = permuteStickers(SOLVED_FACELETS, [[F2, D2], [D2, F2]]);
  const result = validateCube(faceletsToColors(facelets));
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes('edge-impossible'));
  assert.ok(result.errors.some((e) => /opposite colors/.test(e.message)));
  assert.ok(result.errors.some((e) => /appears twice/.test(e.message)));
});

test('corner with mirrored colors is rejected', () => {
  const facelets = permuteStickers(SOLVED_FACELETS, [[R1, F3], [F3, R1]]);
  const result = validateCube(faceletsToColors(facelets));
  assert.deepEqual(codes(result), ['corner-mirrored']);
  assert.deepEqual(result.errors[0].facelets, [U9, R1, F3]);
});

test('duplicated piece is detected', () => {
  // FR edge: change its red sticker to orange and an orange sticker to red,
  // so FR now looks like a second FL (green-orange) edge.
  const colors = faceletsToColors(SOLVED_FACELETS);
  colors[R4] = 'orange';
  colors[36] = 'red'; // L0 (ULB corner sticker)
  const result = validateCube(colors);
  assert.ok(codes(result).includes('edge-duplicate'));
  assert.equal(colors[F6], 'green');
});

test('every reachable scrambled state validates', () => {
  for (let k = 0; k < 300; k++) {
    const facelets = applyMoves(SOLVED_FACELETS, randomScramble(30));
    assert.equal(validateCube(faceletsToColors(facelets)).valid, true);
  }
});

test('permutation parity helper', () => {
  assert.equal(permutationParity([0, 1, 2, 3]), 0);
  assert.equal(permutationParity([1, 0, 2, 3]), 1);
  assert.equal(permutationParity([1, 2, 0, 3]), 0);
});

test('solver pipeline: solved cube gives an empty solution', () => {
  assert.deepEqual(verifiedSolution(SOLVED_FACELETS, 'R L U2 R L F2'), []);
});

test('solver pipeline: wrong solutions are rejected by the safety check', () => {
  const facelets = applyMoves(SOLVED_FACELETS, 'R U');
  assert.throws(() => verifiedSolution(facelets, 'R U'), /Safety check failed/);
  assert.deepEqual(verifiedSolution(facelets, "U' R'"), ["U'", "R'"]);
});

test('solver pipeline: known scramble and random states are solved by cubejs', { timeout: 120000 }, () => {
  Cube.initSolver();
  const known = "R U R' U' F2 D L' B2 U F' R2 D2 L B'";
  const states = [applyMoves(SOLVED_FACELETS, known)];
  for (let k = 0; k < 25; k++) states.push(Cube.random().asString()); // uniformly random states
  for (const facelets of states) {
    // Go through validation exactly like the UI does.
    const validation = validateCube(faceletsToColors(facelets));
    assert.equal(validation.valid, true);
    const moves = verifiedSolution(validation.facelets, Cube.fromString(validation.facelets).solve());
    assert.ok(moves.length > 0 && moves.length <= 22, `solution length ${moves.length}`);
    assert.ok(moves.every((m) => /^[URFDLB]['2]?$/.test(m)));
    assert.equal(isSolvedFacelets(applyMoves(facelets, moves)), true);
  }
});
