/**
 * cube-validation.js — checks whether 54 entered colors describe a cube that
 * can physically exist (i.e. can be reached from solved by turning faces).
 *
 * A real cube must satisfy all of these:
 *   1. every sticker has a color, and each color appears exactly 9 times;
 *   2. the six centers are the six different colors of the scheme;
 *   3. every corner/edge shows a color combination that exists on a real
 *      cube, and each of the 8 corners and 12 edges appears exactly once;
 *   4. corner twist: the sum of corner orientations is divisible by 3;
 *   5. edge flip: the sum of edge orientations is divisible by 2;
 *   6. parity: the corner permutation and edge permutation are both even or
 *      both odd (otherwise exactly two pieces are swapped).
 * Failing 4–6 means the cube was taken apart or a sticker was misread.
 */

import {
  COLOR_KEYS, CORNERS, EDGES, FACE_COLORS, FACE_NAMES, FACE_ORDER, colorsToFacelets,
} from './cube-state.js';

const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

const colorOf = (faceLetter) => FACE_COLORS[faceLetter];
const describeColors = (letters) => letters.map(colorOf).join('–');
const describePosition = (faces) => {
  const names = faces.map((f) => FACE_NAMES[f]);
  return names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names[2]}`;
};

const ADVICE = 'Check your entered colors and face orientation (see "How to hold your cube").';

/** Number of transpositions parity of a permutation: 0 = even, 1 = odd. */
export function permutationParity(permutation) {
  const seen = new Array(permutation.length).fill(false);
  let parity = 0;
  for (let i = 0; i < permutation.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    for (let j = i; !seen[j]; j = permutation[j]) { seen[j] = true; length++; }
    parity ^= (length - 1) & 1; // a cycle of length L = L−1 swaps
  }
  return parity;
}

/** Explain why a set of sticker colors cannot be a real piece. */
function explainImpossiblePiece(letters) {
  const unique = new Set(letters);
  if (unique.size < letters.length) {
    const repeated = letters.find((l, i) => letters.indexOf(l) !== i);
    return `${colorOf(repeated)} appears twice on the same piece`;
  }
  for (const l of letters) {
    if (unique.has(OPPOSITE[l])) {
      return `${colorOf(l)} and ${colorOf(OPPOSITE[l])} are opposite colors and never touch`;
    }
  }
  return 'no real piece has this color arrangement';
}

/**
 * Identify all corners and edges.
 * Returns { cp, co, ep, eo, errors } — cp[i] is which corner piece sits at
 * position i, co[i] its twist (0, 1, 2), same for edges with flip (0, 1).
 */
export function identifyPieces(facelets) {
  const errors = [];
  const cp = [], co = [], ep = [], eo = [];

  CORNERS.forEach((position, i) => {
    const letters = position.facelets.map((idx) => facelets[idx]);
    // Orientation = which of the three stickers carries the U or D color.
    const udStickers = letters.filter((l) => l === 'U' || l === 'D').length;
    const ori = letters.findIndex((l) => l === 'U' || l === 'D');
    let piece = -1;
    if (udStickers === 1) {
      const udColor = letters[ori];
      const clockwise1 = letters[(ori + 1) % 3];
      const clockwise2 = letters[(ori + 2) % 3];
      const matches = (c, second, third) => c.faces[0] === udColor && c.faces[1] === second && c.faces[2] === third;
      piece = CORNERS.findIndex((c) => matches(c, clockwise1, clockwise2));
      if (piece === -1 && CORNERS.some((c) => matches(c, clockwise2, clockwise1))) {
        errors.push({
          code: 'corner-mirrored',
          facelets: position.facelets,
          message: `The corner between the ${describePosition(position.faces)} faces shows `
            + `${describeColors(letters)} in mirror-image order — two of its stickers are probably swapped. ${ADVICE}`,
        });
        cp[i] = -1; co[i] = 0;
        return;
      }
    }
    if (piece === -1) {
      errors.push({
        code: 'corner-impossible',
        facelets: position.facelets,
        message: `The corner between the ${describePosition(position.faces)} faces shows `
          + `${describeColors(letters)}: ${explainImpossiblePiece(letters)}. ${ADVICE}`,
      });
    }
    cp[i] = piece; co[i] = piece === -1 ? 0 : ori;
  });

  EDGES.forEach((position, i) => {
    const [a, b] = position.facelets.map((idx) => facelets[idx]);
    let piece = EDGES.findIndex((e) => e.faces[0] === a && e.faces[1] === b);
    let flip = 0;
    if (piece === -1) {
      piece = EDGES.findIndex((e) => e.faces[0] === b && e.faces[1] === a);
      flip = 1;
    }
    if (piece === -1) {
      errors.push({
        code: 'edge-impossible',
        facelets: position.facelets,
        message: `The edge between the ${describePosition(position.faces)} faces shows `
          + `${describeColors([a, b])}: ${explainImpossiblePiece([a, b])}. ${ADVICE}`,
      });
    }
    ep[i] = piece; eo[i] = piece === -1 ? 0 : flip;
  });

  // Each piece must appear exactly once.
  const reportDuplicates = (permutation, pieces, kind) => {
    pieces.forEach((piece, j) => {
      const at = permutation.flatMap((p, i) => (p === j ? [i] : []));
      if (at.length > 1) {
        errors.push({
          code: `${kind}-duplicate`,
          facelets: at.flatMap((i) => pieces[i].facelets),
          message: `The ${describeColors(piece.faces)} ${kind} appears ${at.length} times, `
            + `so another ${kind} is missing. ${ADVICE}`,
        });
      }
    });
  };
  reportDuplicates(cp, CORNERS, 'corner');
  reportDuplicates(ep, EDGES, 'edge');

  return { cp, co, ep, eo, errors };
}

/**
 * Validate 54 UI colors (color keys such as 'white', or null when not yet entered).
 * Returns { valid, errors: [{ code, message, facelets? }], facelets }.
 * `facelets` is the solver-format string (only meaningful when valid).
 */
export function validateCube(colors) {
  const fail = (errors) => ({ valid: false, errors, facelets: null });

  if (!Array.isArray(colors) || colors.length !== 54) {
    return fail([{ code: 'length', message: 'Internal error: expected exactly 54 stickers.' }]);
  }

  // 1. Every sticker entered, with a known color.
  const missing = colors.flatMap((c, i) => (c == null ? [i] : []));
  if (missing.length) {
    return fail([{
      code: 'incomplete',
      facelets: missing,
      message: `${missing.length} sticker${missing.length === 1 ? ' is' : 's are'} still empty. Enter all 54 stickers before validating.`,
    }]);
  }
  const unknown = colors.flatMap((c, i) => (COLOR_KEYS.includes(c) ? [] : [i]));
  if (unknown.length) {
    return fail([{ code: 'unknown-color', facelets: unknown, message: 'Some stickers have an unrecognized color.' }]);
  }

  // 2. Each color exactly nine times.
  const counts = Object.fromEntries(COLOR_KEYS.map((k) => [k, 0]));
  colors.forEach((c) => { counts[c]++; });
  const wrongCounts = COLOR_KEYS.filter((k) => counts[k] !== 9);
  if (wrongCounts.length) {
    const details = wrongCounts.map((k) => `${k}: ${counts[k]}`).join(', ');
    return fail([{
      code: 'color-count',
      message: `Invalid cube configuration: each color must appear exactly 9 times (${details}). `
        + 'One or more stickers were entered with the wrong color.',
    }]);
  }

  // 3. Centers must match the color scheme.
  const badCenters = FACE_ORDER.filter((face, f) => colors[f * 9 + 4] !== FACE_COLORS[face]);
  if (badCenters.length) {
    return fail([{
      code: 'centers',
      facelets: badCenters.map((face) => FACE_ORDER.indexOf(face) * 9 + 4),
      message: 'The center stickers do not match the standard color scheme '
        + '(white Up, green Front, red Right, yellow Down, orange Left, blue Back).',
    }]);
  }

  const facelets = colorsToFacelets(colors);

  // 4. Identify every piece.
  const { cp, co, ep, eo, errors } = identifyPieces(facelets);
  if (errors.length) return fail(errors);

  // 5. Orientation and permutation invariants.
  const invariantErrors = [];
  const twist = co.reduce((a, b) => a + b, 0) % 3;
  if (twist !== 0) {
    invariantErrors.push({
      code: 'corner-twist',
      message: 'Invalid cube configuration: one corner appears to be twisted in place. '
        + 'Re-check the three stickers of each corner — usually one corner was entered rotated. ' + ADVICE,
    });
  }
  const flip = eo.reduce((a, b) => a + b, 0) % 2;
  if (flip !== 0) {
    invariantErrors.push({
      code: 'edge-flip',
      message: 'Invalid cube configuration: one edge piece appears to be flipped. '
        + 'Re-check both stickers of each edge — usually one edge was entered with its colors reversed. ' + ADVICE,
    });
  }
  if (permutationParity(cp) !== permutationParity(ep)) {
    invariantErrors.push({
      code: 'parity',
      message: 'Invalid cube configuration: two pieces appear to be swapped. ' + ADVICE,
    });
  }
  if (invariantErrors.length) return fail(invariantErrors);

  return { valid: true, errors: [], facelets };
}
