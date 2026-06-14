/* loop/drive.mjs — Playwright helper for the trip-planner discovery loop.
 *
 * Drives the Travel Companion SPA in a headless browser so the traveler agent
 * can attempt a planning step "as a real user", capture friction (console/page
 * errors), and screenshot the result. Dev-tooling ONLY — never shipped, never
 * imported by the app.
 *
 * Usage:
 *   node loop/drive.mjs <url> [options]
 * Options:
 *   --view <name>      append "#alpine/<name>" to the url (e.g. itinerary, budget)
 *   --shot <path>      screenshot path (default loop/shots/last.png)
 *   --wait <ms>        extra settle wait after load (default 600)
 *   --click <selector> click one selector after load
 *   --steps <file>     JSON file: array of {action,selector?,text?,ms?,path?}
 *                      actions: click | type | wait | goto | screenshot | eval
 *                      ({action:"eval", code:"<expr>"} -> result appended to note)
 *
 * Prints a compact JSON report to stdout:
 *   {url, ok, consoleErrors, pageErrors, title, visibleViewTabs, note}
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

// --- resolve playwright (npx-installed location) -----------------------------
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright not found. Run: npx playwright install chromium');
  console.log(JSON.stringify({ url: null, ok: false, consoleErrors: [], pageErrors: [],
    title: null, visibleViewTabs: [], note: 'playwright import failed' }));
  process.exit(2);
}

// --- tiny arg parser ---------------------------------------------------------
const argv = process.argv.slice(2);
const url0 = argv[0];
if (!url0 || url0.startsWith('--')) {
  console.error('usage: node loop/drive.mjs <url> [--view v] [--shot p] [--wait ms] [--click sel] [--steps file]');
  process.exit(2);
}
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const view  = opt('--view');
const shot  = opt('--shot') || 'loop/shots/last.png';
const wait  = parseInt(opt('--wait') || '600', 10);
const click = opt('--click');
const stepsFile = opt('--steps');

// build target url: strip trailing slash dupes, append hash route if a view given
let url = url0;
if (view) url = url0.replace(/#.*$/, '').replace(/\/+$/, '/') + '#alpine/' + view;

const TIMEOUT = 15000;
const consoleErrors = [];
const pageErrors = [];
let note = '';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

let ok = false;
let title = null;
let visibleViewTabs = [];

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  // wait for the app shell: the marker text or the view container
  await page.waitForFunction(
    () => /Travel Companion/.test(document.body.innerText) ||
          !!document.querySelector('[data-view], #view, main'),
    { timeout: TIMEOUT }
  ).catch(() => { note += 'shell-marker-not-found; '; });
  // the app paints "Loading..." then fetches+renders — wait for real content
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#view, [data-view], main') || document.body;
      const t = (el.innerText || '').trim();
      return t.length > 60 && !/^Loading\.\.\.$/.test(t);
    },
    { timeout: TIMEOUT }
  ).catch(() => { note += 'content-not-rendered(stuck-on-Loading?); '; });
  if (wait) await page.waitForTimeout(wait);

  if (click) {
    await page.click(click, { timeout: TIMEOUT }).catch((e) => { note += `click(${click}) failed: ${e.message}; `; });
    await page.waitForTimeout(300);
  }

  // optional scripted steps
  if (stepsFile) {
    let steps = [];
    try { steps = JSON.parse(readFileSync(stepsFile, 'utf8')); }
    catch (e) { note += `steps parse failed: ${e.message}; `; }
    for (const s of steps) {
      try {
        if (s.action === 'click') await page.click(s.selector, { timeout: TIMEOUT });
        else if (s.action === 'type') await page.fill(s.selector, s.text ?? '');
        else if (s.action === 'wait') await page.waitForTimeout(s.ms ?? 300);
        else if (s.action === 'goto') await page.goto(s.selector, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        else if (s.action === 'screenshot') {
          mkdirSync(dirname(s.path || shot), { recursive: true });
          await page.screenshot({ path: s.path || shot, fullPage: true });
        }
        else if (s.action === 'eval') {
          // run an expression in page context for DOM inspection; result -> note
          const r = await page.evaluate(new Function('return (' + (s.code ?? 'null') + ')'));
          note += `eval=${JSON.stringify(r)}; `;
        }
      } catch (e) { note += `step ${s.action} failed: ${e.message}; `; }
    }
  }

  // collect visible nav/view tabs for orientation
  visibleViewTabs = await page.$$eval(
    '[data-view], nav a, nav button, .tab, .nav a, .nav button',
    (els) => els.map((e) => (e.getAttribute('data-view') || e.textContent || '').trim())
                .filter(Boolean).slice(0, 40)
  ).catch(() => []);

  title = await page.title().catch(() => null);
  ok = pageErrors.length === 0; // load + no hard page errors
} catch (e) {
  note += `navigation failed: ${e.message}; `;
  ok = false;
} finally {
  try { mkdirSync(dirname(shot), { recursive: true }); await page.screenshot({ path: shot, fullPage: true }); }
  catch (e) { note += `screenshot failed: ${e.message}; `; }
  await browser.close().catch(() => {});
}

console.log(JSON.stringify({ url, ok, consoleErrors, pageErrors, title, visibleViewTabs, note: note.trim() }));
process.exit(ok ? 0 : 1);
