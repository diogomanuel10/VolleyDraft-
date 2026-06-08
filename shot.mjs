import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
// Ignore offline leaderboard cert noise — it's not an app error.
page.on('console', m => { if (m.type() === 'error' && !/ERR_CERT/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('file://' + process.cwd() + '/index.html');
await page.waitForTimeout(400);

// 1) Lobby
await page.screenshot({ path: 'screens/1-start.png' });

// Enter the draft from the lobby.
await page.click('#startBtn');
await page.waitForTimeout(400);

// Roster is full once the season button becomes enabled/visible.
async function rosterFull() {
  return page.evaluate(() => {
    const b = document.getElementById('seasonBtn');
    return !!b && !b.disabled && b.offsetParent !== null;
  });
}

// Draft a full lineup: keep spinning and picking the first eligible player.
let squadShot = false;
for (let i = 0; i < 80 && !(await rosterFull()); i++) {
  if (await page.locator('#spinBtn').isVisible()) {
    await page.click('#spinBtn').catch(() => {});
    await page.waitForTimeout(3300); // spin animation
  }
  const card = page.locator('#playerList .pcard:not(.disabled)').first();
  if (await card.count() > 0) {
    // 2) Capture the squad panel on the first successful spin.
    if (!squadShot) { await page.screenshot({ path: 'screens/2-spin-squad.png' }); squadShot = true; }
    await card.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}
if (!(await rosterFull())) throw new Error('Could not complete the roster');

// 3) Completed roster
await page.waitForTimeout(400);
await page.screenshot({ path: 'screens/3-roster-full.png' });

// 4) Simulate season -> modal
await page.click('#seasonBtn');
await page.waitForTimeout(900);
await page.screenshot({ path: 'screens/4-season-top.png' });

// 5) Full season modal
const modal = page.locator('#modal');
await modal.screenshot({ path: 'screens/5-season-full.png' });

// Sanity check the VNL structure rendered correctly.
const info = await page.evaluate(() => {
  const m = document.getElementById('modal');
  return {
    standingsRows: [...m.querySelectorAll('.standings tr')].length - 1,
    sections: [...m.querySelectorAll('.section-title')].map(s => s.textContent),
    matchBlocks: [...m.querySelectorAll('.match')].length,
  };
});
console.log('Season modal:', JSON.stringify(info));
console.log('Console errors:', errors.length ? errors : 'none');

await browser.close();
