/**
 * notation.js — plain-language explanations of standard move notation.
 *
 * All directions assume you hold the cube the way you entered it:
 * GREEN center facing you, WHITE center on top (red on your right).
 * "Clockwise" always means clockwise as seen when looking straight at the
 * face being turned.
 */
import { FACE_COLORS, FACE_NAMES, parseMove } from './cube-state.js';

/** What a clockwise / counter-clockwise turn looks like from the front. */
const FACE_HINTS = {
  R: { cw: 'The right column moves UP (front → top).', ccw: 'The right column moves DOWN (front → bottom).' },
  L: { cw: 'The left column moves DOWN (front → bottom).', ccw: 'The left column moves UP (front → top).' },
  U: { cw: 'The top row moves to the LEFT (front → left).', ccw: 'The top row moves to the RIGHT (front → right).' },
  D: { cw: 'The bottom row moves to the RIGHT (front → right).', ccw: 'The bottom row moves to the LEFT (front → left).' },
  F: {
    cw: 'Turn it like a steering wheel to the right: its top edge moves to the right.',
    ccw: 'Turn it like a steering wheel to the left: its top edge moves to the left.',
  },
  B: {
    cw: 'Seen from the front this looks backwards: the back layer\'s top edge moves to the LEFT.',
    ccw: 'Seen from the front: the back layer\'s top edge moves to the RIGHT.',
  },
};

/**
 * Describe a move for a beginner.
 * Returns { notation, title, detail, direction: 'cw' | 'ccw' | 'double' }.
 */
export function describeMove(move) {
  const { face, quarterTurns } = parseMove(move);
  const faceName = FACE_NAMES[face];
  const color = FACE_COLORS[face];
  const where = `the ${faceName.toUpperCase()} face (${color} center)`;

  if (quarterTurns === 2) {
    return {
      notation: move,
      direction: 'double',
      title: `${faceName} face — half turn (180°)`,
      detail: `Turn ${where} twice, 180° in total. Either direction gives the same result.`,
    };
  }
  const clockwise = quarterTurns === 1;
  return {
    notation: move,
    direction: clockwise ? 'cw' : 'ccw',
    title: `${faceName} face — ${clockwise ? 'clockwise' : 'counter-clockwise'} 90°`,
    detail: `Turn ${where} a quarter turn ${clockwise ? 'clockwise' : 'counter-clockwise'}, as if you were looking straight at it. `
      + `Keep green in front and white on top: ${FACE_HINTS[face][clockwise ? 'cw' : 'ccw']}`,
  };
}
