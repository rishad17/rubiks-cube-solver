# CubeSolver 3D — Enter. Solve. Master.

Enter the colors of your scrambled 3×3 Rubik's Cube, press **Solve Cube**, and follow an
animated 3D solution one move at a time on your real cube.

- Real solver: Herbert Kociemba's **two-phase algorithm** (via [cube.js](https://github.com/ldez/cubejs), MIT).
  Solutions are usually 19–22 moves and take milliseconds. They are short but **not guaranteed optimal**.
- Real validation: piece identification, corner twist, edge flip and permutation parity.
- Every solution is re-checked by the app's own independent cube model before it is shown.
- No build step and no runtime dependencies to install: Three.js and cube.js are included in `vendor/`.

---

## Quick start (Windows + VS Code)

You need **one** of these two options. Both serve the files over `http://`, which is required:
the page uses ES modules and a Web Worker, and **browsers block those on `file://`** (double-clicking
`index.html` will not work).

### Option A: VS Code Live Server (easiest)

1. Open VS Code → **File → Open Folder…** → choose the `Rubik's Cube Solver` folder.
2. Open the **Extensions** panel (`Ctrl+Shift+X`), search for **Live Server** (by Ritwick Dey), and click **Install**.
3. In the Explorer, right-click `index.html` → **Open with Live Server**.
4. Your browser opens at something like `http://127.0.0.1:5500/index.html`. Done.

Yes, Live Server is all you need.

### Option B: Node.js (no extension needed)

1. Install Node.js 18 or newer from <https://nodejs.org> (the "LTS" version).
2. In VS Code open a terminal (**Terminal → New Terminal**) in the project folder and run:

   ```
   npm start
   ```

3. Open <http://localhost:8080> in Chrome, Edge or Firefox. Press `Ctrl+C` in the terminal to stop.

`npm start` runs `serve.mjs`, a tiny built-in server. `npm install` is **not** required.

---

## How to use it

1. **Hold your cube with the green center facing you and the white center on top** (red is then on your right).
   Centers never move, so this always works. The page's "How to hold your cube" panel has a diagram.
2. Fill in the six grids. They are laid out as an unfolded cube:
   - **F, R, B, L**: turn the whole cube left a quarter turn at a time (white stays on top) and enter each face as you see it.
   - **U**: from the starting position, tip the top toward you. Green is at the *bottom* of the U grid.
   - **D**: from the starting position, tip the bottom up toward you. Green is at the *top* of the D grid.
   - The colored bars around each grid show which neighboring face touches that edge.
3. To enter colors, click a sticker and choose a color (keys `1`–`6` work too), **or** click a color in the
   palette to use it as a paint brush and click stickers to paint them.
4. Press **Validate Cube**. If something is wrong you get an explanation, and the bad stickers flash red.
5. Press **Solve Cube**, then **Next move** for each step, doing the same turn on your real cube.

Keyboard shortcuts while solving: `→` next, `←` previous, `Space` play/pause, `Home` restart, `V` reset the camera.

**Notation:** `R` = turn the Right face 90° clockwise *as seen looking straight at that face*;
`R'` = counter-clockwise; `R2` = half turn. Same for U (up), D (down), F (front), B (back), L (left).

---

## Project structure

```
Rubik's Cube Solver/
├── index.html               Page structure + import map for Three.js
├── style.css                All styling (dark theme, responsive layout)
├── serve.mjs                Tiny static web server for `npm start`
├── package.json             npm scripts (start, test); no dependencies
├── js/
│   ├── main.js              Wires everything together; the app workflow
│   ├── cube-state.js        Logical cube: facelet format, 3D sticker geometry, moves
│   ├── cube-validation.js   "Is this a physically possible cube?" checks
│   ├── solver.js            Promise wrapper for the solver worker + solution safety check
│   ├── solver-worker.js     Web Worker that runs cube.js (Kociemba two-phase)
│   ├── cube3d.js            Three.js cube: 26 cubies, real layer rotations, camera
│   ├── solution-player.js   Next / Previous / Restart / Play; keeps 3D and logic in sync
│   ├── color-input.js       The six sticker grids, color popover and paint brushes
│   ├── notation.js          Plain-language move explanations
│   └── orientation-guide.js The "how to hold your cube" diagram
├── vendor/
│   ├── three/               three.js r160 (three.module.js, OrbitControls, RoundedBoxGeometry)
│   └── cubejs/              cube.js 1.3.2 (cube.js, solve.js)
└── tests/
    ├── cube-state.test.js            Moves and state transformations (+ agreement with cube.js)
    ├── validation-and-solver.test.js Validation cases and full solve pipeline
    └── browser/e2e.mjs               Optional end-to-end test in a real browser
```

### How the pieces fit together

- **One cube format everywhere.** The cube is a 54-character facelet string in Kociemba order
  `U R F D L B` (9 stickers per face, row by row). This is exactly what cube.js's `Cube.fromString()` expects,
  so the input grids, the validator, the solver and the player all share it. Grid button *n* on the
  page is facelet index *n*.
- **Moves are real rotations.** `cube-state.js` gives every sticker a 3D position and normal and
  builds each move by rotating those vectors 90°. `cube3d.js` uses the same axis/direction table
  (`FACE_TURNS`) to rotate the actual cubie meshes, so the logical model and the animation agree.
- **Synchronisation.** The player updates the logical state immediately, queues the matching
  animation, and afterwards reads the colors back *from the 3D scene* to confirm they match. The
  "Cube solved!" message only appears once the 3D scene itself is confirmed solved.
- **Safety net.** cube.js does not validate its input, so the app validates first. Every solution is
  then re-applied with the app's own move model, and any sequence that does not solve the cube is
  rejected instead of shown. (cube.js also returns a non-empty sequence for an already-solved cube; the
  app handles that case as "Already solved".)

---

## Tests

Requires Node.js 18+:

```
npm test
```

27 tests cover: move definitions match standard notation (R, U, F, L, D, B directions); X⁴ = identity;
agreement with cube.js on all 18 moves and 2,000 random sequences; scramble + inverse = solved;
UI color ↔ solver format mapping; rejection of incomplete input, wrong color counts, flipped edges,
twisted corners, swapped pieces (parity), impossible/mirrored/duplicate pieces; and the full pipeline
(validation → cube.js → verification) on a known scramble plus 25 uniformly random cube states.

Optional browser test (headless Microsoft Edge): drives the real page, steps through a full solution
comparing the 3D scene with the logical state after **every** move, and checks for console errors.

```
npm install --no-save playwright-core
npm start                                  (keep running)
node tests/browser/e2e.mjs http://localhost:8080/
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Orange banner "must be opened through a local web server", or a blank page | You opened `index.html` directly (`file://`). Use Live Server or `npm start`. |
| Console: `Failed to resolve module specifier "three"` | The import map in `index.html` is missing or comes *after* a module script. It must stay above `<script type="module">`. |
| Console: 404 for `vendor/three/...` or `vendor/cubejs/...` | The `vendor` folder is missing or was renamed. It must sit next to `index.html`. |
| "Solver failed to load" | Same as above (worker can't load `vendor/cubejs`), or the page is on `file://`. |
| Console: `Failed to load module script ... MIME type "text/plain"` | Your server sends `.js` files with the wrong type. Use Live Server or `npm start`. |
| `npm start` says the port is in use | Run `node serve.mjs 8081` and open `http://localhost:8081`. |
| 3D cube doesn't appear | Your browser/GPU has WebGL disabled. Try an up-to-date Chrome, Edge or Firefox. |
| Validation says a piece is impossible | Usually the face was entered rotated. Re-check how you held the cube (green front, white top, U/D tipped as described above). |
| Changes don't show up | Hard-refresh with `Ctrl+F5`. |

## Credits

- [cube.js](https://github.com/ldez/cubejs) by Petri Lehtinen & Ludovic Fernandez, MIT license (`vendor/cubejs/LICENSE`).
- [three.js](https://threejs.org), MIT license (`vendor/three/LICENSE`).
