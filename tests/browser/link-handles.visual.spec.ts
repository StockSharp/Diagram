import { expect, test } from '@playwright/test';

test('selected link uses compact relink handles', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/component.html');
    await page.waitForFunction(() => (window as unknown as { fixtureReady?: boolean }).fixtureReady === true);

    await page.evaluate(async () => {
        const diagram = (window as unknown as {
            fixtureDiagram: {
                saveDocument(): { links: Array<{ id: string }> };
                selectLink(linkId: string): void;
            };
        }).fixtureDiagram;
        diagram.selectLink(diagram.saveDocument().links[0].id);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    const host = await page.locator('#diagram').boundingBox();
    expect(host).not.toBeNull();
    await expect(page).toHaveScreenshot('selected-link-relink-handles.png', {
        clip: {
            x: host!.x + 50,
            y: host!.y + 45,
            width: 480,
            height: 245,
        },
    });
});
