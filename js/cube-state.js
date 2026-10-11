/**
 * cube-state.js — the logical (non-visual) model of a 3×3 Rubik's Cube.
 *
 * STATE FORMAT
 * ------------
 * The whole cube is stored as a 54-character "facelet string", exactly the
 * format used by Kociemba's algorithm and by the cubejs solver library:
 *
 *   index  0– 8 : U face (Up)
 *   index  9–17 : R face (Right)
 *   index 18–26 : F face (Front)
 *   index 27–35 : D face (Down)
 *   index 36–44 : L face (Left)
 *   index 45–53 : B face (Back)
 *
 * Each character is the NAME OF THE FACE whose center has that color
 * (e.g. 'U' = "same color as the Up center"). A solved cube is
 * "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB".
 *
 * Within a face the nine stickers are read row by row, left to right,
 * as seen when looking at that face in this "unfolded net":
 *
 *              ┌──────────┐
 *              │ U0 U1 U2 │      U is seen from above, with the BACK edge on top.
 *              │ U3 U4 U5 │
 *              │ U6 U7 U8 │
 *   ┌──────────┼──────────┼──────────┬──────────┐
 *   │ L0 L1 L2 │ F0 F1 F2 │ R0 R1 R2 │ B0 B1 B2 │  L, F, R, B are seen from the
 *   │ L3 L4 L5 │ F3 F4 F5 │ R3 R4 R5 │ B3 B4 B5 │  side, with the UP edge on top.
 *   │ L6 L7 L8 │ F6 F7 F8 │ R6 R7 R8 │ B6 B7 B8 │
 *   └──────────┼──────────┼──────────┴──────────┘
 *              │ D0 D1 D2 │      D is seen from below, with the FRONT edge on top.
 *              │ D3 D4 D5 │
 *              │ D6 D7 D8 │
 *              └──────────┘
 *
 * 3D COORDINATES
 * --------------
 * Every sticker also has a 3D position and an outward normal, using the same
 * axes as the Three.js scene: +x = Right, +y = Up, +z = Front.
 * Cubie coordinates are integers in {-1, 0, 1}. Moves are implemented as
 * genuine 90° rotations of these coordinates, so the logical model and the
 * 3D animation are guaranteed to agree.
 */

/** Face order used by the facelet string (Kociemba / cubejs order). */
export const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];

export const FACE_NAMES = {
  U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back',
};

/**
 * Standard (Western / BOY) color scheme: white top, green front.
 * With white on top and green facing you, red is on the right.
 */
export const FACE_COLORS = {
  U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue',
};

export const COLOR_KEYS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'];

export const COLOR_HEX = {
  white: '#f4f6f8',
  yellow: '#ffd500',
  green: '#009e60',
  blue: '#0051ba',
  red: '#c41e3a',
  orange: '#ff5800',
};

export const SOLVED_FACELETS = FACE_ORDER.map((face) => face.repeat(9)).join('');

/** Outward normal of each face. */
export const FACE_NORMALS = {
  U: [0, 1, 0], D: [0, -1, 0],
  R: [1, 0, 0], L: [-1, 0, 0],
  F: [0, 0, 1], B: [0, 0, -1],
};

/**
 * Position of sticker (row, col) on a face, as a cubie coordinate.
 * These formulas encode the net orientation drawn at the top of this file.
 */
const STICKER_POSITION = {
  U: (r, c) => [c - 1, 1, r - 1],
  R: (r, c) => [1, 1 - r, 1 - c],
  F: (r, c) => [c - 1, 1 - r, 1],
  D: (r, c) => [c - 1, -1, 1 - r],
  L: (r, c) => [-1, 1 - r, c - 1],
  B: (r, c) => [1 - c, 1 - r, -1],
};

/** For every facelet index 0..53: { face, position: [x,y,z], normal: [x,y,z] }. */
export const FACELET_GEOMETRY = FACE_ORDER.flatMap((face) =>
  Array.from({ length: 9 }, (_, i) => ({
    face,
    position: STICKER_POSITION[face](Math.floor(i / 3), i % 3),
    normal: FACE_NORMALS[face],
  })),
);

const geometryKey = (position, normal) => `${position.join(',')}|${normal.join(',')}`;

const FACELET_INDEX_BY_GEOMETRY = new Map(
  FACELET_GEOMETRY.map((g, index) => [geometryKey(g.position, g.normal), index]),
);

/** Look up which facelet index sits at a given cubie position facing a given direction. */
export function faceletIndexAt(position, normal) {
  const index = FACELET_INDEX_BY_GEOMETRY.get(geometryKey(position, normal));
  return index === undefined ? -1 : index;
}

/* ------------------------------------------------------------------------ *
 * MOVES
 * ------------------------------------------------------------------------ */

/**
 * Each face turn rotates the layer whose coordinate on `axis` equals `layer`.
 * `clockwiseSign` is the sign of the rotation angle (right-hand rule around
 * the positive axis) that turns the face CLOCKWISE as seen when looking
 * straight at that face. E.g. R is clockwise seen from the right (+x side),
 * which is a negative rotation about +x; L is clockwise seen from the left
 * (−x side), which is a positive rotation about +x.
 */
export const FACE_TURNS = {
  U: { axis: 'y', layer: 1, clockwiseSign: -1 },
  D: { axis: 'y', layer: -1, clockwiseSign: 1 },
  R: { axis: 'x', layer: 1, clockwiseSign: -1 },
  L: { axis: 'x', layer: -1, clockwiseSign: 1 },
  F: { axis: 'z', layer: 1, clockwiseSign: -1 },
  B: { axis: 'z', layer: -1, clockwiseSign: 1 },
};

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

/** Parse "R", "R'", "R2" into { face, quarterTurns } where quarterTurns ∈ {1, 2, 3}. */
export function parseMove(move) {
  const match = /^([URFDLB])(2|'|’)?$/.exec(String(move).trim());
  if (!match) throw new Error(`Unknown move "${move}". Use U, R, F, D, L, B with optional ' or 2.`);
  const suffix = match[2];
  const quarterTurns = suffix === '2' ? 2 : suffix ? 3 : 1;
  return { face: match[1], quarterTurns };
}

/** Rotation angle (radians) of a move around its axis. R2 uses −π (same result as +π). */
export function moveAngle(move) {
  const { face, quarterTurns } = parseMove(move);
  const sign = FACE_TURNS[face].clockwiseSign;
  const quarter = quarterTurns === 3 ? -1 : quarterTurns; // counter-clockwise = −1 quarter
  return sign * quarter * (Math.PI / 2);
}

/**
 * Rotate an integer vector by one quarter turn (+90°, right-hand rule)
 * around the given axis. Exact integer arithmetic — no floating point.
 */
function rotateQuarterPositive([x, y, z], axis) {
  if (axis === 'x') return [x, -z, y];
  if (axis === 'y') return [z, y, -x];
  return [-y, x, z]; // axis 'z'
}

function rotateVector(vector, axis, positiveQuarterTurns) {
  let result = vector;
  const turns = ((positiveQuarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) result = rotateQuarterPositive(result, axis);
  return result;
}

/**
 * Build the permutation for a move: newState[i] = oldState[source[i]].
 * We physically rotate every sticker in the turning layer and record where
 * it lands.
 */
function buildMovePermutation(move) {
  const { face, quarterTurns } = parseMove(move);
  const { axis, layer, clockwiseSign } = FACE_TURNS[face];
  const positiveTurns = clockwiseSign * quarterTurns;
  const source = Array.from({ length: 54 }, (_, i) => i);

  FACELET_GEOMETRY.forEach((sticker, from) => {
    if (sticker.position[AXIS_INDEX[axis]] !== layer) return; // not in the turning layer
    const newPosition = rotateVector(sticker.position, axis, positiveTurns);
    const newNormal = rotateVector(sticker.normal, axis, positiveTurns);
    source[faceletIndexAt(newPosition, newNormal)] = from;
  });
  return source;
}

export const ALL_MOVES = FACE_ORDER.flatMap((f) => [f, `${f}'`, `${f}2`]);

const MOVE_PERMUTATIONS = Object.fromEntries(ALL_MOVES.map((m) => [m, buildMovePermutation(m)]));

/** Normalize a move to canonical spelling ("R’" → "R'"). */
export function normalizeMove(move) {
  const { face, quarterTurns } = parseMove(move);
  return face + (quarterTurns === 2 ? '2' : quarterTurns === 3 ? "'" : '');
}

/** Split "R U2 F'" (or an array) into an array of normalized moves. */
export function parseMoveSequence(sequence) {
  if (Array.isArray(sequence)) return sequence.map(normalizeMove);
  const text = String(sequence || '').trim();
  if (!text) return [];
  return text.split(/\s+/).map(normalizeMove);
}

/** Apply one move to a facelet string and return the new facelet string. */
export function applyMove(facelets, move) {
  const source = MOVE_PERMUTATIONS[normalizeMove(move)];
  let result = '';
  for (let i = 0; i < 54; i++) result += facelets[source[i]];
  return result;
}

export function applyMoves(facelets, moves) {
  return parseMoveSequence(moves).reduce(applyMove, facelets);
}

/** The move that undoes `move` (R ↔ R', R2 ↔ R2). */
export function invertMove(move) {
  const { face, quarterTurns } = parseMove(move);
  return face + (quarterTurns === 2 ? '2' : quarterTurns === 1 ? "'" : '');
}

export function invertSequence(moves) {
  return parseMoveSequence(moves).reverse().map(invertMove);
}

/** True when every face shows a single color. */
export function isSolvedFacelets(facelets) {
  for (let f = 0; f < 6; f++) {
    const center = facelets[f * 9 + 4];
    for (let i = 0; i < 9; i++) if (facelets[f * 9 + i] !== center) return false;
  }
  return true;
}

/** Random scramble with no two consecutive turns of the same face. */
export function randomScramble(length = 25, random = Math.random) {
  const moves = [];
  let previousFace = null;
  while (moves.length < length) {
    const face = FACE_ORDER[Math.floor(random() * 6)];
    if (face === previousFace) continue;
    previousFace = face;
    moves.push(face + ['', "'", '2'][Math.floor(random() * 3)]);
  }
  return moves;
}

/* ------------------------------------------------------------------------ *
 * CONVERSION between UI colors and facelet letters
 * ------------------------------------------------------------------------ */

/** colors: array of 54 color keys (e.g. 'white') → facelet string using the centers. */
export function colorsToFacelets(colors) {
  const faceByColor = {};
  FACE_ORDER.forEach((face, f) => { faceByColor[colors[f * 9 + 4]] = face; });
  return colors.map((color) => faceByColor[color] ?? '?').join('');
}

/** facelet string → array of 54 color keys, using the standard color scheme. */
export function faceletsToColors(facelets) {
  return Array.from(facelets, (letter) => FACE_COLORS[letter] ?? null);
}

/* ------------------------------------------------------------------------ *
 * PIECES (cubies) — used by validation
 * ------------------------------------------------------------------------ */

/** Facelet index of sticker n (1..9, as in Kociemba's papers) on a face. */
const fi = (face, n) => FACE_ORDER.indexOf(face) * 9 + (n - 1);

/**
 * The 8 corner positions. Each lists its three facelets starting with the
 * U/D sticker and going CLOCKWISE around the corner. The home piece of a
 * position has the colors of the faces in its name, in the same order.
 */
export const CORNERS = [
  { name: 'URF', faces: ['U', 'R', 'F'], facelets: [fi('U', 9), fi('R', 1), fi('F', 3)] },
  { name: 'UFL', faces: ['U', 'F', 'L'], facelets: [fi('U', 7), fi('F', 1), fi('L', 3)] },
  { name: 'ULB', faces: ['U', 'L', 'B'], facelets: [fi('U', 1), fi('L', 1), fi('B', 3)] },
  { name: 'UBR', faces: ['U', 'B', 'R'], facelets: [fi('U', 3), fi('B', 1), fi('R', 3)] },
  { name: 'DFR', faces: ['D', 'F', 'R'], facelets: [fi('D', 3), fi('F', 9), fi('R', 7)] },
  { name: 'DLF', faces: ['D', 'L', 'F'], facelets: [fi('D', 1), fi('L', 9), fi('F', 7)] },
  { name: 'DBL', faces: ['D', 'B', 'L'], facelets: [fi('D', 7), fi('B', 9), fi('L', 7)] },
  { name: 'DRB', faces: ['D', 'R', 'B'], facelets: [fi('D', 9), fi('R', 9), fi('B', 7)] },
];

/** The 12 edge positions, each with its two facelets in a fixed reference order. */
export const EDGES = [
  { name: 'UR', faces: ['U', 'R'], facelets: [fi('U', 6), fi('R', 2)] },
  { name: 'UF', faces: ['U', 'F'], facelets: [fi('U', 8), fi('F', 2)] },
  { name: 'UL', faces: ['U', 'L'], facelets: [fi('U', 4), fi('L', 2)] },
  { name: 'UB', faces: ['U', 'B'], facelets: [fi('U', 2), fi('B', 2)] },
  { name: 'DR', faces: ['D', 'R'], facelets: [fi('D', 6), fi('R', 8)] },
  { name: 'DF', faces: ['D', 'F'], facelets: [fi('D', 2), fi('F', 8)] },
  { name: 'DL', faces: ['D', 'L'], facelets: [fi('D', 4), fi('L', 8)] },
  { name: 'DB', faces: ['D', 'B'], facelets: [fi('D', 8), fi('B', 8)] },
  { name: 'FR', faces: ['F', 'R'], facelets: [fi('F', 6), fi('R', 4)] },
  { name: 'FL', faces: ['F', 'L'], facelets: [fi('F', 4), fi('L', 6)] },
  { name: 'BL', faces: ['B', 'L'], facelets: [fi('B', 6), fi('L', 4)] },
  { name: 'BR', faces: ['B', 'R'], facelets: [fi('B', 4), fi('R', 6)] },
];
