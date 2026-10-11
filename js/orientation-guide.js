/**
 * orientation-guide.js — draws a small isometric cube showing how to hold
 * the physical cube: white on top (U), green in front (F), red on the right (R).
 */
import { COLOR_HEX } from './cube-state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(name, attributes, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/** Draw a 3×3 sticker face from origin `o` spanned by edge vectors `a` and `b`. */
function drawFace(svg, o, a, b, color) {
  const point = (i, j) => [o[0] + (a[0] * i + b[0] * j) / 3, o[1] + (a[1] * i + b[1] * j) / 3];
  const inset = 0.09;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const corners = [
        point(i + inset, j + inset), point(i + 1 - inset, j + inset),
        point(i + 1 - inset, j + 1 - inset), point(i + inset, j + 1 - inset),
      ];
      svg.appendChild(el('polygon', {
        points: corners.map((p) => p.join(',')).join(' '),
        fill: color, stroke: 'rgba(0,0,0,.35)', 'stroke-width': '0.6', 'stroke-linejoin': 'round',
      }));
    }
  }
}

export function renderOrientationDiagram(container) {
  const svg = el('svg', { viewBox: '0 0 220 190', role: 'img' });
  // Dark cube body.
  svg.appendChild(el('polygon', {
    points: '110,18 172,50 172,124 110,156 48,124 48,50', fill: '#0c0f16', stroke: '#0c0f16', 'stroke-width': '6', 'stroke-linejoin': 'round',
  }));
  drawFace(svg, [110, 18], [62, 32], [-62, 32], COLOR_HEX.white);   // U
  drawFace(svg, [48, 50], [62, 32], [0, 74], COLOR_HEX.green);      // F
  drawFace(svg, [110, 82], [62, -32], [0, 74], COLOR_HEX.red);      // R

  const label = (x, y, text, anchor = 'middle') => svg.appendChild(el('text', {
    x, y, 'text-anchor': anchor, class: 'diagram-label',
  }, text));
  label(110, 54, 'U');
  label(79, 108, 'F');
  label(141, 108, 'R');

  const note = (x, y, text, anchor) => svg.appendChild(el('text', { x, y, 'text-anchor': anchor, class: 'diagram-note' }, text));
  note(110, 10, 'Back: blue (behind)', 'middle');
  note(6, 150, 'Left: orange', 'start');
  note(214, 150, 'Right: red', 'end');
  note(110, 178, 'Down: yellow (underneath)', 'middle');
  note(6, 40, 'Front: green', 'start');
  note(214, 40, 'Up: white', 'end');

  container.replaceChildren(svg);
}
