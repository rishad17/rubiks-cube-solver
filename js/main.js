/**
 * main.js — wires the modules together and drives the user workflow:
 *
 *   enter colors → Validate Cube → Solve Cube → follow the moves step by step.
 *
 * Single source of truth: the 54 colors held by ColorInput. Every change
 * there updates the 3D preview and invalidates any previous validation or
 * solution, so the input, 3D cube, solver and player can never disagree.
 */
import {
  SOLVED_FACELETS, applyMoves, faceletsToColors, isSolvedFacelets, parseMoveSequence, randomScramble,
} from './cube-state.js';
import { validateCube } from './cube-validation.js';
import { CubeSolver } from './solver.js';
import { Cube3D } from './cube3d.js';
import { ColorInput } from './color-input.js';
import { SolutionPlayer } from './solution-player.js';
import { describeMove } from './notation.js';
import { renderOrientationDiagram } from './orientation-guide.js';

const $ = (id) => document.getElementById(id);

const ui = {
  viewer: $('viewer'),
  viewerBadge: $('viewerBadge'),
  labelsToggle: $('labelsToggle'),
  resetViewBtn: $('resetViewBtn'),
  solverStatus: $('solverStatus'),
  counterValue: $('counterValue'),
  counter: $('counter'),
  message: $('message'),
  validateBtn: $('validateBtn'),
  solveBtn: $('solveBtn'),
  solveLabel: $('solveLabel'),
  scrambleBtn: $('scrambleBtn'),
  solvedBtn: $('solvedBtn'),
  resetBtn: $('resetBtn'),
  scrambleForm: $('scrambleForm'),
  scrambleInput: $('scrambleInput'),
  solutionCard: $('solutionCard'),
  solutionMeta: $('solutionMeta'),
  copyBtn: $('copyBtn'),
  moveBig: $('moveBig'),
  moveTitle: $('moveTitle'),
  moveDetail: $('moveDetail'),
  progressText: $('progressText'),
  progressBar: $('progressBar'),
  completeBanner: $('completeBanner'),
  completeText: $('completeText'),
  restartBtn: $('restartBtn'),
  prevBtn: $('prevBtn'),
  nextBtn: $('nextBtn'),
  playBtn: $('playBtn'),
  playLabel: $('playLabel'),
  speedRange: $('speedRange'),
  moveList: $('moveList'),
  toast: $('toast'),
};

/* ------------------------------------------------------------------ setup */

const cube3d = new Cube3D(ui.viewer);
const solver = new CubeSolver();
const player = new SolutionPlayer(cube3d, renderPlayer);
const colorInput = new ColorInput(
  { net: $('net'), palette: $('palette'), popover: $('colorPopover') },
  onColorsChanged,
);
renderOrientationDiagram($('orientationDiagram'));
cube3d.onStickerClick = (index, x, y) => colorInput.editSticker(index, x, y);

/** Validated solver-format state, or null when the current input is not validated. */
let validatedFacelets = null;
let solving = false;
let celebrated = false;

onColorsChanged(colorInput.getColors());
cube3d.setAnimationSpeed(Number(ui.speedRange.value));

/* ---------------------------------------------------------- input changes */

function onColorsChanged(colors) {
  validatedFacelets = null;
  if (player.isLoaded) exitSolutionMode();
  cube3d.setColors(colors);
  colorInput.highlight([]);
  hideMessage();

  const entered = colors.filter(Boolean).length;
  ui.counterValue.textContent = entered;
  ui.counter.classList.toggle('is-complete', entered === 54);
  updateSolveButton();
}

function updateSolveButton() {
  ui.solveBtn.disabled = !validatedFacelets || solving;
  ui.solveBtn.title = validatedFacelets ? 'Compute a solution' : 'Validate your cube first';
}

/* ------------------------------------------------------------- validation */

function validate() {
  const result = validateCube(colorInput.getColors());
  colorInput.highlight(result.errors.flatMap((e) => e.facelets ?? []));
  if (!result.valid) {
    validatedFacelets = null;
    updateSolveButton();
    const incomplete = result.errors[0]?.code === 'incomplete';
    showMessage(incomplete ? 'warning' : 'error',
      incomplete ? 'Not finished yet' : 'This cube configuration is not possible',
      result.errors.map((e) => e.message));
    return false;
  }
  validatedFacelets = result.facelets;
  updateSolveButton();
  if (isSolvedFacelets(result.facelets)) {
    showMessage('success', 'Valid — and already solved!', ['Scramble your cube (or press “Random scramble”) to get a solution.']);
  } else {
    showMessage('success', 'Valid cube ✓', ['All pieces, orientations and parity check out. Press “Solve Cube”.']);
  }
  return true;
}

/* ---------------------------------------------------------------- solving */

async function solve() {
  if (!validatedFacelets || solving) return;
  const facelets = validatedFacelets;
  solving = true;
  updateSolveButton();
  ui.solveBtn.classList.add('is-busy');
  ui.solveLabel.textContent = solverReady ? 'Solving…' : 'Loading solver…';
  try {
    const result = await solver.solve(facelets);
    if (facelets !== validatedFacelets) return; // input changed meanwhile
    if (result.alreadySolved) {
      showMessage('success', 'Already solved 🎉', ['Your cube is already solved — no moves needed.']);
      return;
    }
    enterSolutionMode(facelets, result.moves, result.ms);
  } catch (error) {
    console.error(error);
    showMessage('error', 'Could not solve the cube', [error.message]);
  } finally {
    solving = false;
    ui.solveBtn.classList.remove('is-busy');
    ui.solveLabel.textContent = 'Solve Cube';
    updateSolveButton();
  }
}

let solverReady = false;
function setSolverStatus(state, text) {
  ui.solverStatus.dataset.state = state;
  ui.solverStatus.querySelector('.status-text').textContent = text;
}

function warmUpSolver() {
  setSolverStatus('loading', 'Preparing solver…');
  solver.init().then(() => {
    solverReady = true;
    setSolverStatus('ready', 'Solver ready');
  }).catch((error) => {
    console.error(error);
    setSolverStatus('error', 'Solver failed to load');
    showMessage('error', 'The solver could not be loaded', [error.message]);
  });
}

/* --------------------------------------------------------- solution mode */

function enterSolutionMode(facelets, moves, ms) {
  celebrated = false;
  ui.solutionCard.hidden = false;
  document.body.classList.add('is-solving');
  cube3d.setEditable(false);
  ui.viewerBadge.textContent = 'Solution mode — follow along';
  ui.viewerBadge.classList.add('is-solution');
  ui.solutionMeta.textContent = `${moves.length} moves · found in ${Math.max(1, Math.round(ms))} ms · `
    + 'Kociemba two-phase (short, not guaranteed optimal) · verified ✓';

  ui.moveList.replaceChildren(...moves.map((move, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-chip';
    button.innerHTML = `<span class="chip-num">${i + 1}</span>${move}`;
    button.title = `Jump to move ${i + 1} (${describeMove(move).title})`;
    button.addEventListener('click', () => player.goTo(i));
    li.appendChild(button);
    return li;
  }));

  showMessage('success', `Solved in ${moves.length} moves`, ['Follow the step-by-step solution. Press “Next move” and turn your real cube the same way.']);
  player.load(facelets, moves);
  // Wide screens show the cube and the solution side by side; phones stack them.
  const stacked = window.matchMedia('(max-width: 1080px)').matches;
  const target = stacked ? ui.solutionCard : ui.viewer.closest('.card');
  requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function exitSolutionMode() {
  player.unload();
  ui.solutionCard.hidden = true;
  document.body.classList.remove('is-solving');
  cube3d.setEditable(true);
  ui.viewerBadge.textContent = 'Click a sticker to set its color';
  ui.viewerBadge.classList.remove('is-solution');
}

function renderPlayer(state) {
  if (!player.isLoaded) return;
  const { index, total, currentMove, complete, playing, displayVerifiedSolved } = state;

  if (currentMove) {
    const info = describeMove(currentMove);
    ui.moveBig.textContent = currentMove;
    ui.moveBig.dataset.direction = info.direction;
    ui.progressText.textContent = `Move ${index + 1} of ${total}`;
    ui.moveTitle.textContent = info.title;
    ui.moveDetail.textContent = info.detail;
  } else {
    ui.moveBig.textContent = '✓';
    ui.moveBig.dataset.direction = 'done';
    ui.progressText.textContent = `All ${total} moves done`;
    ui.moveTitle.textContent = 'Finished';
    ui.moveDetail.textContent = 'Use “Previous” to step back, or “Restart” to replay from your scramble.';
  }

  ui.progressBar.style.width = `${(index / total) * 100}%`;
  ui.prevBtn.disabled = index === 0;
  ui.nextBtn.disabled = complete;
  ui.restartBtn.disabled = index === 0 && !playing;
  ui.playBtn.classList.toggle('is-playing', playing);
  ui.playLabel.textContent = playing ? 'Pause' : complete ? 'Replay' : 'Play';

  ui.completeBanner.hidden = !complete;
  if (complete) {
    ui.completeText.textContent = displayVerifiedSolved
      ? `All ${total} moves done. Verified: every face of the 3D cube is a single color. Your real cube should be solved too!`
      : 'Finishing the last turn…';
    if (displayVerifiedSolved && !celebrated) {
      celebrated = true;
      showToast('🎉 Cube solved!');
    }
  } else {
    celebrated = false;
  }

  [...ui.moveList.children].forEach((li, i) => {
    const chip = li.firstChild;
    chip.classList.toggle('is-done', i < index);
    chip.classList.toggle('is-current', i === index);
  });
  const currentChip = ui.moveList.children[index]?.firstChild;
  if (currentChip) {
    // Scroll inside the list only (scrollIntoView would also scroll the page).
    const list = ui.moveList;
    const top = currentChip.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - currentChip.offsetHeight) {
      list.scrollTo({ top: top - list.clientHeight / 2, behavior: 'smooth' });
    }
  }
}

/* -------------------------------------------------------------- helpers */

function showMessage(type, title, lines = []) {
  const box = ui.message;
  box.hidden = false;
  box.dataset.type = type;
  const heading = document.createElement('strong');
  heading.textContent = title;
  const children = [heading];
  if (lines.length === 1) {
    const p = document.createElement('p');
    p.textContent = lines[0];
    children.push(p);
  } else if (lines.length > 1) {
    const ul = document.createElement('ul');
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    children.push(ul);
  }
  box.replaceChildren(...children);
}

function hideMessage() {
  ui.message.hidden = true;
}

let toastTimer = null;
function showToast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  ui.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast.classList.remove('is-visible');
    setTimeout(() => { ui.toast.hidden = true; }, 300);
  }, 2400);
}

async function copySolution() {
  const text = player.moves.join(' ');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showToast('Solution copied to clipboard');
}

function loadFacelets(facelets) {
  colorInput.setColors(faceletsToColors(facelets));
}

/* ------------------------------------------------------------- events */

ui.validateBtn.addEventListener('click', validate);
ui.solveBtn.addEventListener('click', solve);

ui.scrambleBtn.addEventListener('click', () => {
  const moves = randomScramble(22);
  loadFacelets(applyMoves(SOLVED_FACELETS, moves));
  ui.scrambleInput.value = moves.join(' ');
  showMessage('info', 'Random scramble loaded', [`Scramble: ${moves.join(' ')}`, 'Now press “Validate Cube”, then “Solve Cube”.']);
});

ui.solvedBtn.addEventListener('click', () => {
  loadFacelets(SOLVED_FACELETS);
  showMessage('info', 'Solved cube loaded', ['Useful for testing. Press “Validate Cube”.']);
});

ui.resetBtn.addEventListener('click', () => {
  colorInput.resetColors();
  showMessage('info', 'Colors cleared', ['Only the six fixed centers remain. Start entering your cube.']);
});

ui.scrambleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  let moves;
  try {
    moves = parseMoveSequence(ui.scrambleInput.value);
  } catch (error) {
    showMessage('error', 'Could not read that sequence', [error.message]);
    return;
  }
  loadFacelets(applyMoves(SOLVED_FACELETS, moves));
  showMessage('info', `Applied ${moves.length} move${moves.length === 1 ? '' : 's'}`, ['Now press “Validate Cube”, then “Solve Cube”.']);
});

ui.nextBtn.addEventListener('click', () => { player.pause(); player.next(); });
ui.prevBtn.addEventListener('click', () => player.previous());
ui.restartBtn.addEventListener('click', () => player.restart());
ui.playBtn.addEventListener('click', () => (player.playing ? player.pause() : player.play()));
ui.copyBtn.addEventListener('click', copySolution);
ui.speedRange.addEventListener('input', () => cube3d.setAnimationSpeed(Number(ui.speedRange.value)));
ui.resetViewBtn.addEventListener('click', () => cube3d.resetView());
ui.labelsToggle.addEventListener('change', () => cube3d.setLabelsVisible(ui.labelsToggle.checked));

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target.closest?.('input, textarea, select, [contenteditable], .popover')) return;
  if (!$('colorPopover').hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'v' || event.key === 'V') { cube3d.resetView(); return; }
  if (!player.isLoaded) return;
  if (event.key === 'ArrowRight') { player.pause(); player.next(); event.preventDefault(); }
  else if (event.key === 'ArrowLeft') { player.previous(); event.preventDefault(); }
  else if (event.key === 'Home') { player.restart(); event.preventDefault(); }
  else if (event.key === ' ' && !target.closest?.('button')) {
    if (player.playing) player.pause(); else player.play();
    event.preventDefault();
  }
});

// Build the solver tables in the background shortly after the page appears.
setTimeout(warmUpSolver, 400);

// Exposed for debugging in the browser console (e.g. `cubeApp.player.state`).
window.cubeApp = { cube3d, solver, player, colorInput, validateCube };
