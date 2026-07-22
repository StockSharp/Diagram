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

test('node properties change live input and output connection policies', async ({ page }) => {
    await page.goto('/demo/index.html');
    await expect(page.locator('#modelStats')).toHaveText('7 nodes · 8 links');
    const canvas = page.locator('#diagram canvas');

    const nodePoint = async (nodeId: string): Promise<[number, number]> => page.evaluate((id) => {
        const renderer = (window as unknown as {
            stockSharpDiagramDemo: {
                renderer: {
                    findNode(nodeId: string): { x: number; y: number; w: number; h: number } | undefined;
                    toScreen(x: number, y: number): [number, number];
                };
            };
        }).stockSharpDiagramDemo.renderer;
        const node = renderer.findNode(id)!;
        return renderer.toScreen(node.x + node.w / 2, node.y + node.h / 2);
    }, nodeId);
    const dragPort = async (fromNode: string, fromPort: string, toNode: string, toPort: string): Promise<void> => {
        const points = await page.evaluate((args) => {
            const renderer = (window as unknown as {
                stockSharpDiagramDemo: {
                    renderer: {
                        findNode(nodeId: string): {
                            inPorts: Array<{ id: string; cx: number; cy: number }>;
                            outPorts: Array<{ id: string; cx: number; cy: number }>;
                        } | undefined;
                        toScreen(x: number, y: number): [number, number];
                    };
                };
            }).stockSharpDiagramDemo.renderer;
            const source = renderer.findNode(args.fromNode)!.outPorts.find((port) => port.id === args.fromPort)!;
            const target = renderer.findNode(args.toNode)!.inPorts.find((port) => port.id === args.toPort)!;
            return {
                source: renderer.toScreen(source.cx, source.cy),
                target: renderer.toScreen(target.cx, target.cy),
            };
        }, { fromNode, fromPort, toNode, toPort });
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.move(box!.x + points.source[0], box!.y + points.source[1]);
        await page.mouse.down();
        await page.mouse.move(box!.x + points.target[0], box!.y + points.target[1], { steps: 8 });
        await page.mouse.up();
    };
    const openFastProperties = async (): Promise<void> => {
        const box = await canvas.boundingBox();
        const point = await nodePoint('fast');
        expect(box).not.toBeNull();
        await page.mouse.dblclick(box!.x + point[0], box!.y + point[1]);
        await expect(page.locator('#indicatorDialog')).toBeVisible();
    };

    await openFastProperties();
    await expect(page.locator('#indicatorInputType')).toHaveValue('Candle');
    await expect(page.locator('#indicatorInputMulti')).not.toBeChecked();
    await expect(page.locator('#indicatorOutputMulti')).toBeChecked();
    await page.locator('#indicatorInputType').selectOption('Object');
    await page.locator('#indicatorInputMulti').check();
    await page.locator('#indicatorOutputMulti').uncheck();
    await page.locator('#indicatorForm button[type="submit"]').click();

    await dragPort('slow', 'value', 'fast', 'source');
    await expect(page.locator('#modelStats')).toHaveText('7 nodes · 9 links');
    await dragPort('fast', 'value', 'chart', 'object');
    await expect(page.locator('#modelStats')).toHaveText('7 nodes · 9 links');
    await expect(page.locator('#status')).toHaveText('Rejected: the output does not allow another wire.');

    await openFastProperties();
    await expect(page.locator('#indicatorInputType')).toHaveValue('Object');
    await expect(page.locator('#indicatorInputMulti')).toBeChecked();
    await page.locator('#indicatorOutputMulti').check();
    await page.locator('#indicatorForm button[type="submit"]').click();
    await dragPort('fast', 'value', 'chart', 'object');
    await expect(page.locator('#modelStats')).toHaveText('7 nodes · 10 links');
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
