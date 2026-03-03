#!/usr/bin/env node
/**
 * Villa Portal — Playwright UI Test Suite
 * Tests login, navigation, demo sequences, WebSocket, TTS
 *
 * Run: npx playwright test-ui.js
 *   or: node test-ui.js
 *
 * Requires: npm install playwright (one-time)
 * Set PORTAL_URL and PORTAL_KEY env vars or uses defaults (Mech Mac localhost)
 */

import { chromium } from 'playwright';

const PORTAL_URL = process.env.PORTAL_URL || 'http://192.168.0.60:8406';
const PORTAL_KEY = process.env.PORTAL_KEY || 'ecef97cb7a41751dcb63c6bf1129f02e';

let passed = 0;
let failed = 0;

function pass(name, detail) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  console.log(`\nVilla Portal UI Tests`);
  console.log(`Target: ${PORTAL_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect JS errors
  const jsErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') jsErrors.push(msg.text());
  });
  page.on('pageerror', err => jsErrors.push(err.message));

  try {
    // --- Test 1: Login page loads ---
    console.log('1. Login');
    await page.goto(PORTAL_URL, { timeout: 10000 });
    const loginOverlay = await page.locator('#login-overlay').isVisible();
    if (loginOverlay) {
      pass('Login page loads');
    } else {
      fail('Login page loads', 'overlay not visible');
    }

    // --- Test 2: Token login via form ---
    console.log('\n2. Authentication');
    await page.fill('#login-key', PORTAL_KEY);
    await page.click('#login-form button[type="submit"]');
    await page.waitForTimeout(1000);

    const appVisible = await page.locator('#app').isVisible();
    const loginHidden = await page.locator('#login-overlay').isHidden();
    if (appVisible && loginHidden) {
      pass('Form login with portal key');
    } else {
      fail('Form login with portal key', 'app not visible after login');
    }

    // --- Test 3: Query-string login ---
    const page2 = await context.newPage();
    await page2.goto(`${PORTAL_URL}/?token=${PORTAL_KEY}`, { timeout: 10000 });
    await page2.waitForTimeout(1500);
    const app2Visible = await page2.locator('#app').isVisible();
    if (app2Visible) {
      pass('Query-string token auto-login');
    } else {
      fail('Query-string token auto-login');
    }
    await page2.close();

    // --- Test 4: Navigation tabs ---
    console.log('\n3. Navigation');
    const tabs = ['chat', 'dashboard', 'demo', 'visual', 'music', 'audio', 'images'];
    for (const tab of tabs) {
      const btn = page.locator(`.nav-tab[data-panel="${tab}"]`);
      const exists = await btn.count() > 0;
      if (exists) {
        await btn.click();
        await page.waitForTimeout(300);
        const panelActive = await page.locator(`#panel-${tab}`).evaluate(
          el => el.classList.contains('active')
        );
        if (panelActive) {
          pass(`Tab: ${tab}`);
        } else {
          fail(`Tab: ${tab}`, 'panel not active after click');
        }
      } else {
        fail(`Tab: ${tab}`, 'tab button not found');
      }
    }

    // --- Test 5: Dashboard loads data ---
    console.log('\n4. Dashboard');
    await page.locator('.nav-tab[data-panel="dashboard"]').click();
    await page.waitForTimeout(2000);

    const modeBadge = await page.locator('#mode-badge').textContent();
    if (modeBadge && modeBadge !== '--') {
      pass('Mode badge shows current mode', modeBadge);
    } else {
      fail('Mode badge shows current mode', `got: "${modeBadge}"`);
    }

    // --- Test 6: Demo tab ---
    console.log('\n5. Demo Sequences');
    await page.locator('.nav-tab[data-panel="demo"]').click();
    await page.waitForTimeout(1500);

    const demoCards = await page.locator('.demo-card').count();
    if (demoCards >= 4) {
      pass('Demo sequence cards loaded', `${demoCards} cards`);
    } else {
      fail('Demo sequence cards loaded', `only ${demoCards} cards`);
    }

    // Click a card and check start button
    const firstCard = page.locator('.demo-card').first();
    if (await firstCard.count() > 0) {
      await firstCard.click();
      await page.waitForTimeout(300);
      const startBtn = page.locator('#demo-start');
      const btnText = await startBtn.textContent();
      const btnDisabled = await startBtn.isDisabled();
      if (!btnDisabled && btnText.includes('Start')) {
        pass('Demo card selection enables start button', btnText);
      } else {
        fail('Demo card selection enables start button', `disabled=${btnDisabled}, text="${btnText}"`);
      }
    }

    // --- Test 7: WebSocket connection ---
    console.log('\n6. WebSocket');
    const wsStatus = await page.locator('#ws-status').evaluate(
      el => el.classList.contains('connected')
    );
    if (wsStatus) {
      pass('WebSocket connected');
    } else {
      fail('WebSocket connected', 'status dot not green');
    }

    // --- Test 8: Chat module ---
    console.log('\n7. Chat');
    await page.locator('.nav-tab[data-panel="chat"]').click();
    await page.waitForTimeout(500);

    const chatInput = page.locator('#chat-input');
    const chatInputVisible = await chatInput.isVisible();
    if (chatInputVisible) {
      pass('Chat input visible');
    } else {
      fail('Chat input visible');
    }

    const agentSelect = page.locator('#chat-agent');
    const agentOptions = await agentSelect.locator('option').count();
    if (agentOptions >= 5) {
      pass('Agent selector populated', `${agentOptions} agents`);
    } else {
      fail('Agent selector populated', `only ${agentOptions}`);
    }

    // --- Test 9: JS errors ---
    console.log('\n8. Console Errors');
    if (jsErrors.length === 0) {
      pass('No JavaScript errors');
    } else {
      fail(`${jsErrors.length} JavaScript error(s)`);
      jsErrors.slice(0, 5).forEach(e => console.log(`     ${e.substring(0, 120)}`));
    }

  } catch (err) {
    fail('Unexpected error', err.message);
  } finally {
    await browser.close();
  }

  // Summary
  const total = passed + failed;
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  console.log('='.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
}

run();
