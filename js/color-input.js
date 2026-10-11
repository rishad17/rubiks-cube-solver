/**
 * color-input.js — the "Enter Your Cube" sticker grids.
 *
 * The six faces are laid out as the standard unfolded net (see cube-state.js),
 * so the array index of each sticker button IS its solver facelet index.
 * Colored bars around each grid show which neighboring face touches each
 * edge, so the user can see how to hold the cube for every face.
 *
 * Interaction:
 *   - click a sticker → a popover with the six colors appears;
 *   - or pick a "paint brush" color in the palette, then click stickers to
 *     paint them directly (faster for entering a whole cube).
 * Stickers clicked on the 3D cube go through editSticker() and behave the same.
 * Center stickers are fixed to their face color.
 */
import { COLOR_HEX, COLOR_KEYS, FACE_COLORS, FACE_NAMES, FACE_ORDER } from './cube-state.js';

/** For each face: which face touches its [top, right, bottom, left] edge in the grid. */
const NEIGHBORS = {
  U: ['B', 'R', 'F', 'L'],
  F: ['U', 'R', 'D', 'L'],
  R: ['U', 'B', 'D', 'F'],
  B: ['U', 'L', 'D', 'R'],
  L: ['U', 'F', 'D', 'B'],
  D: ['F', 'R', 'B', 'L'],
};

const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

export class ColorInput {
  /**
   * @param {object} elements { net, palette, popover }
   * @param {(colors: (string|null)[]) => void} onChange
   */
  constructor({ net, palette, popover }, onChange) {
    this.netEl = net;
    this.paletteEl = palette;
    this.popoverEl = popover;
    this.onChange = onChange;
    this.colors = new Array(54).fill(null);
    this.brush = null;          // selected paint color, or null = popover mode
    this.activeIndex = null;    // sticker whose popover is open
    this.buttons = [];

    this.#renderNet();
    this.#renderPalette();
    this.#renderPopover();
    this.resetColors(false);
  }

  /* ------------------------------------------------------------ public */

  getColors() { return [...this.colors]; }

  setColors(colors, notify = true) {
    this.colors = colors.map((c, i) => (this.#isCenter(i) ? this.#centerColor(i) : c ?? null));
    this.#refresh();
    if (notify) this.onChange(this.getColors());
  }

  /** Clear every sticker except the fixed centers. */
  resetColors(notify = true) {
    this.setColors(new Array(54).fill(null), notify);
  }

  /**
   * Edit a sticker picked somewhere else (the 3D cube): paint it with the
   * active brush, or open the color popover at the given screen point.
   */
  editSticker(index, clientX, clientY) {
    if (this.#isCenter(index)) return;
    if (this.brush) {
      this.#setColor(index, this.colors[index] === this.brush ? null : this.brush);
      return;
    }
    const point = { left: clientX, right: clientX, top: clientY, bottom: clientY, width: 0, height: 0 };
    this.#openPopover(index, point);
  }

  get enteredCount() { return this.colors.filter(Boolean).length; }

  /** Outline the given sticker indices (e.g. the stickers of an invalid piece). */
  highlight(indices = []) {
    const set = new Set(indices);
    this.buttons.forEach((b, i) => b.classList.toggle('is-flagged', set.has(i)));
  }

  /* ---------------------------------------------------------- rendering */

  #isCenter(i) { return i % 9 === 4; }
  #centerColor(i) { return FACE_COLORS[FACE_ORDER[Math.floor(i / 9)]]; }

  #renderNet() {
    this.netEl.innerHTML = '';
    for (const face of FACE_ORDER) {
      const f = FACE_ORDER.indexOf(face);
      const wrapper = document.createElement('div');
      wrapper.className = `face face-${face}`;
      const [top, right, bottom, left] = NEIGHBORS[face].map((n) => FACE_COLORS[n]);
      wrapper.style.setProperty('--edge-top', COLOR_HEX[top]);
      wrapper.style.setProperty('--edge-right', COLOR_HEX[right]);
      wrapper.style.setProperty('--edge-bottom', COLOR_HEX[bottom]);
      wrapper.style.setProperty('--edge-left', COLOR_HEX[left]);
      wrapper.title = `${FACE_NAMES[face]} face: ${top} side on top, ${right} side on the right, `
        + `${bottom} side at the bottom, ${left} side on the left`;

      const label = document.createElement('div');
      label.className = 'face-label';
      label.innerHTML = `<strong>${face}</strong> ${FACE_NAMES[face]}`;
      wrapper.appendChild(label);

      const grid = document.createElement('div');
      grid.className = 'face-grid';
      for (let s = 0; s < 9; s++) {
        const index = f * 9 + s;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sticker';
        button.dataset.index = index;
        if (this.#isCenter(index)) {
          button.classList.add('is-center');
          button.disabled = true;
          button.textContent = face;
        }
        button.addEventListener('click', (event) => this.#onStickerClick(index, event));
        grid.appendChild(button);
        this.buttons[index] = button;
      }
      wrapper.appendChild(grid);
      this.netEl.appendChild(wrapper);
    }
  }

  #renderPalette() {
    this.paletteEl.innerHTML = '';
    COLOR_KEYS.forEach((color, i) => {
      const face = FACE_ORDER.find((f) => FACE_COLORS[f] === color);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'palette-chip';
      chip.dataset.color = color;
      chip.setAttribute('aria-pressed', 'false');
      chip.title = `Paint brush: ${color} (key ${i + 1}). Click again to turn off.`;
      chip.innerHTML = `<span class="swatch" style="background:${COLOR_HEX[color]}"></span>`
        + `<span class="chip-text"><span class="chip-name">${capitalize(color)}</span>`
        + `<span class="chip-face">${face} · ${FACE_NAMES[face]}</span></span>`;
      chip.addEventListener('click', () => this.#setBrush(this.brush === color ? null : color));
      this.paletteEl.appendChild(chip);
    });
  }

  #renderPopover() {
    const el = this.popoverEl;
    el.innerHTML = '';
    COLOR_KEYS.forEach((color, i) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'popover-color';
      option.style.background = COLOR_HEX[color];
      option.title = `${capitalize(color)} (${i + 1})`;
      option.setAttribute('aria-label', capitalize(color));
      option.dataset.color = color;
      option.addEventListener('click', () => this.#choose(color));
      el.appendChild(option);
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'popover-clear';
    clear.title = 'Clear this sticker (0)';
    clear.textContent = '✕';
    clear.setAttribute('aria-label', 'Clear sticker');
    clear.addEventListener('click', () => this.#choose(null));
    el.appendChild(clear);

    document.addEventListener('pointerdown', (event) => {
      if (this.activeIndex === null) return;
      if (el.contains(event.target) || event.target.closest?.('.sticker')) return;
      this.#closePopover();
    });
    document.addEventListener('keydown', (event) => {
      if (this.activeIndex === null) return;
      if (event.key === 'Escape') { this.#closePopover(); event.preventDefault(); return; }
      const n = Number(event.key);
      if (n >= 1 && n <= 6) { this.#choose(COLOR_KEYS[n - 1]); event.preventDefault(); }
      if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') { this.#choose(null); event.preventDefault(); }
    });
    window.addEventListener('resize', () => this.#closePopover());
  }

  #refresh() {
    this.buttons.forEach((button, i) => {
      const color = this.colors[i];
      button.style.background = color ? COLOR_HEX[color] : '';
      button.classList.toggle('is-empty', !color);
      const face = FACE_ORDER[Math.floor(i / 9)];
      const s = i % 9;
      button.setAttribute('aria-label',
        `${FACE_NAMES[face]} face, row ${Math.floor(s / 3) + 1}, column ${(s % 3) + 1}: ${color ?? 'empty'}`);
    });
  }

  /* -------------------------------------------------------- interaction */

  #setBrush(color) {
    this.brush = color;
    this.netEl.classList.toggle('is-painting', Boolean(color));
    for (const chip of this.paletteEl.children) {
      const active = chip.dataset.color === color;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
    this.#closePopover();
  }

  #onStickerClick(index, event) {
    if (this.brush) {
      // Paint mode: clicking a sticker with the brush color again clears it.
      this.#setColor(index, this.colors[index] === this.brush ? null : this.brush);
      return;
    }
    if (this.activeIndex === index) { this.#closePopover(); return; }
    this.#openPopover(index, event.currentTarget.getBoundingClientRect());
  }

  /** @param {DOMRect|object} rect screen area the popover is placed next to */
  #openPopover(index, rect) {
    this.#closePopover();
    this.activeIndex = index;
    this.buttons[index].classList.add('is-editing');
    const el = this.popoverEl;
    el.hidden = false;
    for (const option of el.querySelectorAll('.popover-color')) {
      option.classList.toggle('is-current', option.dataset.color === this.colors[index]);
    }
    // Position below the sticker, kept inside the viewport.
    const popRect = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - popRect.width / 2), window.innerWidth - popRect.width - 8);
    let top = rect.bottom + 8;
    if (top + popRect.height > window.innerHeight - 8) top = rect.top - popRect.height - 8;
    el.style.left = `${left + window.scrollX}px`;
    el.style.top = `${top + window.scrollY}px`;
    el.querySelector('.popover-color')?.focus({ preventScroll: true });
  }

  #closePopover() {
    if (this.activeIndex !== null) this.buttons[this.activeIndex]?.classList.remove('is-editing');
    this.activeIndex = null;
    this.popoverEl.hidden = true;
  }

  #choose(color) {
    const index = this.activeIndex;
    if (index === null) return;
    const anchor = this.buttons[index];
    this.#closePopover();
    this.#setColor(index, color);
    anchor.focus({ preventScroll: true });
  }

  #setColor(index, color) {
    if (this.#isCenter(index)) return;
    this.colors[index] = color;
    this.#refresh();
    this.onChange(this.getColors());
  }
}
