import { expect, test } from '@playwright/test';

test('demo exercises palette, theme, runtime errors and full-image export', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/demo/index.html');
    await expect(page.locator('#diagram canvas')).toHaveCount(1);
    await expect(page.locator('#status')).toHaveText('Strategy model reset.');
    await expect(page.locator('#modelStats')).toContainText('7 nodes');

    await page.locator('#paletteSearch').fill('moving average');
    const visibleItems = page.locator('.d-palette-item:not(.is-hidden)');
    await expect(visibleItems).toHaveCount(1);
    await expect(visibleItems).toContainText('Simple Moving Average');
    await visibleItems.dblclick();
    await expect(page.locator('#modelStats')).toContainText('8 nodes');

    await page.locator('#runtimeErrorBtn').click();
    await expect(page.locator('#status')).toContainText('Runtime error highlighted');
    await page.locator('#themeBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-bs-theme', 'light');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('stocksharp-strategy.png');
    await expect(page.locator('#status')).toHaveText('Full strategy image exported.');
    expect(pageErrors).toEqual([]);
});

test('component can be destroyed without leaving its canvas behind', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/component.html');
    await page.waitForFunction(() => (window as unknown as { fixtureReady?: boolean }).fixtureReady === true);
    await expect(page.locator('#diagram canvas')).toHaveCount(1);
    await page.evaluate(() => {
        (window as unknown as { fixtureDiagram: { destroy(): void } }).fixtureDiagram.destroy();
    });
    await expect(page.locator('#diagram canvas')).toHaveCount(0);
});
