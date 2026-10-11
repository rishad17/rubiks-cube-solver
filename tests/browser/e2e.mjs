// Optional end-to-end browser test (NOT part of `npm test`).
// Drives the real page in headless Microsoft Edge: sticker entry, validation
// errors, solving, animated stepping (3D scene compared with the logical state
// after every move), Previous/Next/Restart/Play, keyboard shortcuts, mobile
// layout, and checks that there are no console errors.
//
// Setup (once):  npm install --no-save playwright-core
// Run:           npm start                                   (terminal 1)
//                node tests/browser/e2e.mjs http://localhost:8080/   (terminal 2)
// Uses the Edge browser built into Windows; set channel to 'chrome' for Chrome.
import { chromium } from 'playwright-core';
const URL_ = process.argv[2] || 'http://localhost:8080/';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
const check = (cond, label) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) process.exitCode = 1; };
const synced = () => page.evaluate(async () => {
  await cubeApp.cube3d.whenIdle();
  const { faceletsToColors } = await import('./js/cube-state.js');
  return cubeApp.cube3d.readColors().join() === faceletsToColors(cubeApp.player.facelets).join();
});
const SCR = "R U R' U' F2 D L' B2 U F' R2 D2 L B'";

await page.goto(URL_);
await page.waitForFunction(() => document.querySelector('#solverStatus').dataset.state === 'ready', null, { timeout: 30000 });
check(true, 'solver tables built in worker');
check(await page.textContent('#counterValue') === '6', 'counter starts at 6 (centers)');

// UI popover entry
await page.click('.sticker[data-index="0"]');
check(await page.isVisible('#colorPopover'), 'popover opens on sticker click');
await page.click('#colorPopover .popover-color[data-color="red"]');
await page.waitForTimeout(300);
check(await page.textContent('#counterValue') === '7', 'color chosen -> counter 7');
check(await page.$eval('.sticker[data-index="0"]', (b) => b.style.background) === 'rgb(196, 30, 58)', 'sticker shows red');
check(await page.evaluate(() => cubeApp.cube3d.readColors()[0]) === 'red', '3D preview updated with red at U0');
await page.click('.palette-chip[data-color="blue"]');
await page.click('.sticker[data-index="1"]');
check(await page.evaluate(() => cubeApp.colorInput.getColors()[1]) === 'blue', 'paint brush mode works');
await page.click('.palette-chip[data-color="blue"]');

await page.click('#validateBtn');
check((await page.textContent('#message')).includes('still empty'), 'incomplete cube rejected');
check(await page.isDisabled('#solveBtn'), 'solve disabled before validation');

await page.click('#solvedBtn');
await page.click('#validateBtn');
check((await page.textContent('#message')).includes('already solved'), 'solved cube validates as solved');
await page.click('#solveBtn');
await page.waitForFunction(() => document.querySelector('#message').textContent.includes('no moves needed'));
check(await page.isHidden('#solutionCard'), 'solved cube -> "Already solved", no solution panel');

await page.evaluate(() => { const c = cubeApp.colorInput.getColors(); [c[7], c[19]] = [c[19], c[7]]; cubeApp.colorInput.setColors(c); });
await page.click('#validateBtn');
check((await page.textContent('#message')).includes('flipped'), 'flipped edge rejected');
await page.evaluate(() => { const c = cubeApp.colorInput.getColors(); [c[7], c[19]] = [c[19], c[7]]; [c[7], c[5]] = [c[5], c[7]]; [c[19], c[10]] = [c[10], c[19]]; cubeApp.colorInput.setColors(c); });
await page.click('#validateBtn');
check((await page.textContent('#message')).includes('two pieces appear to be swapped'), 'swapped edges rejected');
await page.evaluate(() => { const c = cubeApp.colorInput.getColors(); c[0] = 'yellow'; cubeApp.colorInput.setColors(c); });
await page.click('#validateBtn');
check((await page.textContent('#message')).includes('exactly 9 times'), 'bad color count rejected');

await page.click('summary');
await page.fill('#scrambleInput', SCR);
await page.click('#scrambleForm button');
await page.click('#validateBtn');
check((await page.textContent('#message')).includes('Valid cube'), 'known scramble validates');
await page.click('#solveBtn');
await page.waitForSelector('#solutionCard:not([hidden])');
const st = await page.evaluate(() => cubeApp.player.state);
console.log('solution:', st.moves.join(' '), `(${st.total})`);
check(st.total > 0 && st.index === 0, 'solution loaded at move 0');
check((await page.textContent('#progressText')) === `Move 1 of ${st.total}`, 'progress text');
await page.waitForTimeout(1200);

await page.evaluate(() => cubeApp.cube3d.setAnimationSpeed(60));
let allSynced = true;
for (let i = 0; i < st.total; i++) {
  await page.click('#nextBtn');
  if (!(await synced())) { allSynced = false; console.log('desync after move', i + 1); }
}
check(allSynced, '3D cube matches logical state after every animated move');
await page.waitForFunction(() => cubeApp.player.state.displayVerifiedSolved, null, { timeout: 5000 });
check((await page.textContent('#completeText')).includes('Verified'), 'completion banner verified from 3D scene');
await page.waitForTimeout(500);

await page.click('#prevBtn');
check(await page.evaluate(() => cubeApp.player.index) === st.total - 1, 'Previous goes back one move');
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowRight');
check(await page.evaluate(() => cubeApp.player.index) === st.total - 1, 'keyboard arrows navigate');
check(await synced(), '3D in sync after backward moves');
await page.click('#restartBtn');
const restartOk = await page.evaluate(async (scr) => {
  const S = await import('./js/cube-state.js');
  const expected = S.faceletsToColors(S.applyMoves(S.SOLVED_FACELETS, scr));
  return cubeApp.player.index === 0 && cubeApp.cube3d.readColors().join() === expected.join();
}, SCR);
check(restartOk, 'Restart restores the original scramble in 3D');
await page.click('#moveList li:nth-child(5) button');
check(await page.evaluate(() => cubeApp.player.index) === 4, 'clicking a move chip jumps there');
await page.click('#playBtn');
await page.waitForFunction(() => cubeApp.player.state.complete && !cubeApp.player.playing, null, { timeout: 30000 });
check(await synced(), 'Play runs to the end in sync');
await page.click('#solvedBtn');
check(await page.isHidden('#solutionCard'), 'editing input closes stale solution');

for (let k = 0; k < 3; k++) {
  await page.click('#scrambleBtn'); await page.click('#validateBtn'); await page.click('#solveBtn');
  await page.waitForSelector('#solutionCard:not([hidden])');
  const ok = await page.evaluate(async () => { const S = await import('./js/cube-state.js'); const p = cubeApp.player; return S.isSolvedFacelets(S.applyMoves(p.initialFacelets, p.moves)); });
  check(ok, `random scramble ${k + 1} solved (${await page.evaluate(() => cubeApp.player.moves.length)} moves)`);
}

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, 'no horizontal scroll at 390px');
await page.evaluate(() => window.scrollTo(0, 0));

check(errors.length === 0, 'no console errors/warnings: ' + JSON.stringify(errors));
await browser.close();
