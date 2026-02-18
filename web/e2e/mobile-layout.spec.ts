import { test, expect, Page } from '@playwright/test';

// iPhone 14 Pro dimensions (portrait)
const IPHONE_VIEWPORT = { width: 393, height: 852 };

async function authenticate(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('rf-auth', 'true'));
  await page.reload();
  await page.waitForSelector('.react-flow', { timeout: 10_000 });
}

async function ensureCanvas(page: Page) {
  const nodeCount = await page.locator('.react-flow__node').count();
  if (nodeCount > 0) return;

  const resp = await page.request.post('/api/canvas', {
    data: {
      name: 'mobile-test',
      root_content: 'Test canvas for mobile E2E',
      skip_auto_response: true,
    },
  });
  expect(resp.ok()).toBeTruthy();
  await page.reload();
  await page.waitForSelector('.react-flow__node', { timeout: 10_000 });
}

async function selectANode(page: Page) {
  const node = page.locator('.react-flow__node').first();
  await node.click();
  // Wait for drawer to appear — mobile uses full-screen overlay
  await page.waitForSelector('button:has-text("Close")', { timeout: 5_000 });
}

test.describe('Mobile portrait layout', () => {
  test.use({ viewport: IPHONE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await authenticate(page);
    await ensureCanvas(page);
    await selectANode(page);
  });

  test('NodeDrawer has a Skills toggle button', async ({ page }) => {
    const skillsBtn = page.locator('button:has-text("Skills")');
    await expect(skillsBtn).toBeVisible();
  });

  test('tapping Skills reveals mode toggle and skill buttons', async ({ page }) => {
    const skillsBtn = page.locator('button:has-text("Skills")');
    await skillsBtn.click();

    // Mode toggle should appear
    const modeBtn = page.locator('button[title="critical (valence)"]');
    await expect(modeBtn).toBeVisible();

    // At least one skill button should appear
    const skill = page.locator('text=Surface assumptions').or(
      page.locator('text=Find opposition')
    ).first();
    await expect(skill).toBeVisible();
  });

  test('tapping Skills again hides the skills pane', async ({ page }) => {
    const skillsBtn = page.locator('button:has-text("Skills")');

    // Open
    await skillsBtn.click();
    const modeBtn = page.locator('button[title="critical (valence)"]');
    await expect(modeBtn).toBeVisible();

    // Close
    await skillsBtn.click();
    await expect(modeBtn).not.toBeVisible();
  });

  test('chat input is still accessible when skills pane is open', async ({ page }) => {
    // Open skills
    await page.locator('button:has-text("Skills")').click();

    // Chat input should still be in the DOM (may need to scroll)
    const chatInput = page.locator('input[placeholder="Ask a question or pick a skill..."]');
    await expect(chatInput).toBeAttached();
  });

  test('Close button dismisses the drawer', async ({ page }) => {
    const closeBtn = page.locator('button:has-text("Close")');
    await closeBtn.click();

    // Drawer should be gone — canvas nodes should be visible again
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    // The Close button should not be visible anymore
    await expect(closeBtn).not.toBeVisible();
  });
});
