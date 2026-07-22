import { expect, test } from '@playwright/test';

test('overview follows explicit dark and light theme palettes', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/tests/browser/fixtures/component.html');
    await page.waitForFunction(() => (window as unknown as { fixtureReady?: boolean }).fixtureReady === true);

    const host = await page.locator('#diagram').boundingBox();
    expect(host).not.toBeNull();
    const overview = {
        x: host!.x + host!.width - 204,
        y: host!.y + host!.height - 144,
        width: 198,
        height: 138,
    };
    await expect(page).toHaveScreenshot('overview-dark.png', { clip: overview });

    await page.evaluate(async () => {
        (window as unknown as { applyFixtureTheme(light: boolean): void }).applyFixtureTheme(true);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect(page).toHaveScreenshot('overview-light.png', { clip: overview });
    expect(pageErrors).toEqual([]);
});
