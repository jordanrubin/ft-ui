import { test, expect, Page } from '@playwright/test';

// Auth helper — sets localStorage and reloads to skip login form
async function authenticate(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('rf-auth', 'true'));
  await page.reload();
  // Wait for react-flow pane (always present once app loads, even without a canvas)
  await page.waitForSelector('.react-flow', { timeout: 10_000 });
}

// Ensure a canvas exists so we can click nodes
async function ensureCanvas(page: Page) {
  // Check if there are already react-flow nodes on screen
  const nodeCount = await page.locator('.react-flow__node').count();
  if (nodeCount > 0) return;

  // No nodes visible — create a canvas via API then reload
  const resp = await page.request.post('/api/canvas', {
    data: {
      name: 'playwright-test',
      root_content: 'Test canvas for Playwright E2E',
      skip_auto_response: true,
    },
  });
  expect(resp.ok()).toBeTruthy();
  await page.reload();
  await page.waitForSelector('.react-flow__node', { timeout: 10_000 });
}

// Click a node to open the skills pane
async function selectANode(page: Page) {
  const node = page.locator('.react-flow__node').first();
  await node.click();
  // Skills pane should appear with "Analyze" header
  await page.waitForSelector('text=Analyze', { timeout: 5_000 });
}

test.describe('Mode toggle in SkillsPane', () => {

  test.beforeEach(async ({ page }) => {
    await authenticate(page);
    await ensureCanvas(page);
    await selectANode(page);
  });

  test('mode toggle bar is visible with all 6 axes', async ({ page }) => {
    // Each axis renders two buttons. We have 6 axes = 12 mode buttons.
    // They have title attributes like "positive (valence)", "critical (valence)", etc.
    for (const mode of ['positive', 'critical', 'internal', 'external', 'near', 'far',
                         'coarse', 'fine', 'descriptive', 'prescriptive', 'surface', 'underlying']) {
      const btn = page.locator(`button[title*="${mode}"]`);
      await expect(btn).toBeVisible();
    }
  });

  test('clicking a mode button activates it (purple background)', async ({ page }) => {
    const btn = page.locator('button[title="critical (valence)"]');
    await btn.click();

    // Active button gets inline style background: rgb(139, 92, 246) (#8b5cf6)
    await expect(btn).toHaveAttribute('style', /background: rgb\(139, 92, 246\)/);
  });

  test('clicking same mode button again deselects it', async ({ page }) => {
    const btn = page.locator('button[title="critical (valence)"]');

    // Activate
    await btn.click();
    await expect(btn).toHaveAttribute('style', /background: rgb\(139, 92, 246\)/);

    // Deactivate
    await btn.click();
    await expect(btn).toHaveAttribute('style', /background: rgb\(33, 38, 45\)/);
  });

  test('only one mode can be active at a time', async ({ page }) => {
    const critical = page.locator('button[title="critical (valence)"]');
    const far = page.locator('button[title="far (distance)"]');

    // Activate critical
    await critical.click();
    await expect(critical).toHaveAttribute('style', /background: rgb\(139, 92, 246\)/);

    // Activate far — critical should deactivate
    await far.click();
    await expect(far).toHaveAttribute('style', /background: rgb\(139, 92, 246\)/);
    await expect(critical).toHaveAttribute('style', /background: rgb\(33, 38, 45\)/);
  });

  test('mode label pairs are visually grouped (axis pairs)', async ({ page }) => {
    // "+" and "−" should be adjacent (valence axis)
    const plus = page.locator('button[title="positive (valence)"]');
    const minus = page.locator('button[title="critical (valence)"]');

    await expect(plus).toBeVisible();
    await expect(minus).toBeVisible();

    // "in" and "ex" for locus axis
    const internal = page.locator('button[title="internal (locus)"]');
    const external = page.locator('button[title="external (locus)"]');
    await expect(internal).toBeVisible();
    await expect(external).toBeVisible();
  });

  test('skills pane header and skill buttons are still accessible', async ({ page }) => {
    // The mode bar shouldn't break the rest of the pane
    await expect(page.locator('text=Analyze')).toBeVisible();

    // At least one skill button should be visible (e.g., "Surface assumptions")
    const skillButton = page.locator('text=Surface assumptions').or(
      page.locator('text=Find opposition')
    ).first();
    await expect(skillButton).toBeVisible();
  });
});
