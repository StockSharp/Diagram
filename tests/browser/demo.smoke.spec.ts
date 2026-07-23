import { expect, test } from '@playwright/test';

test('demo exercises palette, theme, runtime errors and full-image export', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/demo/index.html');
    await expect(page.locator('#diagram canvas')).toHaveCount(1);
    await expect(page.locator('#status')).toHaveText('Strategy model reset.');
    await expect(page.locator('#modelStats')).toContainText('7 nodes');
    const compactTools = page.locator('.demo-header .icon-only');
    await expect(compactTools).toHaveCount(6);
    expect(await compactTools.evaluateAll((buttons) => buttons.every((button) =>
        button.getBoundingClientRect().width <= 30))).toBe(true);

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
    await expect(page.locator('#themeBtn')).toHaveAttribute('aria-label', 'Switch to dark theme');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('stocksharp-strategy.png');
    await expect(page.locator('#status')).toHaveText('Full strategy image exported.');
    expect(pageErrors).toEqual([]);
});

test('demo host handles fullscreen requests from the component', async ({ page }) => {
    await page.goto('/demo/index.html');
    const button = page.locator('[data-ssdiagram-fullscreen-button]');

    await page.evaluate(() => (window as unknown as {
        stockSharpDiagramDemo: { setFullscreenButtonVisible(visible: boolean): void };
    }).stockSharpDiagramDemo.setFullscreenButtonVisible(false));
    await expect(button).toBeHidden();
    await page.evaluate(() => (window as unknown as {
        stockSharpDiagramDemo: { setFullscreenButtonVisible(visible: boolean): void };
    }).stockSharpDiagramDemo.setFullscreenButtonVisible(true));
    await expect(button).toBeVisible();

    await button.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList
        .contains('canvas-panel') ?? false)).toBe(true);
    await expect(button).toHaveAttribute('aria-label', 'Exit fullscreen');
    await expect(button).toHaveClass(/is-active/);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#diagram canvas')).toBeVisible();

    await button.click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expect(button).toHaveAttribute('aria-label', 'Enter fullscreen');
    await expect(button).not.toHaveClass(/is-active/);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('node properties change live input and output connection policies', async ({ page }) => {
    await page.goto('/demo/index.html');
    await expect(page.locator('#modelStats')).toHaveText('7 nodes · 8 links');
    const canvas = page.locator('#diagram canvas');

    const nodePoint = async (nodeId: string): Promise<[number, number]> => page.evaluate((id) => {
        const diagram = (window as unknown as {
            stockSharpDiagramDemo: {
                getNodeBounds(nodeId: string): { x: number; y: number; width: number; height: number } | null;
                worldToView(x: number, y: number): { x: number; y: number };
            };
        }).stockSharpDiagramDemo;
        const node = diagram.getNodeBounds(id)!;
        const point = diagram.worldToView(node.x + node.width / 2, node.y + node.height / 2);
        return [point.x, point.y];
    }, nodeId);
    const dragPort = async (fromNode: string, fromPort: string, toNode: string, toPort: string): Promise<void> => {
        const points = await page.evaluate((args) => {
            const diagram = (window as unknown as {
                stockSharpDiagramDemo: {
                    getPortPosition(nodeId: string, direction: 'in' | 'out', portId: string): { x: number; y: number } | null;
                    worldToView(x: number, y: number): { x: number; y: number };
                };
            }).stockSharpDiagramDemo;
            const source = diagram.getPortPosition(args.fromNode, 'out', args.fromPort)!;
            const target = diagram.getPortPosition(args.toNode, 'in', args.toPort)!;
            const sourceView = diagram.worldToView(source.x, source.y);
            const targetView = diagram.worldToView(target.x, target.y);
            return {
                source: [sourceView.x, sourceView.y] as [number, number],
                target: [targetView.x, targetView.y] as [number, number],
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
    await expect(page.locator('[data-ssdiagram-fullscreen-button]')).toHaveCount(1);
    await page.evaluate(() => {
        (window as unknown as { fixtureDiagram: { destroy(): void } }).fixtureDiagram.destroy();
    });
    await expect(page.locator('#diagram canvas')).toHaveCount(0);
    await expect(page.locator('[data-ssdiagram-fullscreen-button]')).toHaveCount(0);
});

test('selected link endpoint can be relinked with its visible handle', async ({ page }) => {
    await page.goto('/tests/browser/fixtures/component.html');
    await page.waitForFunction(() => (window as unknown as { fixtureReady?: boolean }).fixtureReady === true);
    const canvas = page.locator('#diagram canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const geometry = await page.evaluate(() => {
        const facade = (window as unknown as { fixtureDiagram: unknown }).fixtureDiagram as {
            canvas: {
                links: Array<{ id: string; from: string; to: string }>;
                nodes: Array<{ id: string; inPorts: Array<{ id: string; cx: number; cy: number }> }>;
                endpoint(link: unknown, end: 'from' | 'to'): [number, number];
                routeLink(a: [number, number], b: [number, number], excluded: Set<string>): number[][];
                toScreen(x: number, y: number): [number, number];
            };
        };
        const engine = facade.canvas;
        const link = engine.links[0];
        const from = engine.endpoint(link, 'from');
        const to = engine.endpoint(link, 'to');
        const route = engine.routeLink(from, to, new Set([link.from, link.to]));
        let click = route[0];
        let longest = -1;
        for (let index = 1; index < route.length; index += 1) {
            const previous = route[index - 1];
            const current = route[index];
            const length = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
            if (length > longest) {
                longest = length;
                click = [(previous[0] + current[0]) / 2, (previous[1] + current[1]) / 2];
            }
        }
        const target = engine.nodes.find((node) => node.id === 'result')!.inPorts
            .find((port) => port.id === 'fast')!;
        return {
            linkId: link.id,
            click: engine.toScreen(click[0], click[1]),
            endpoint: engine.toScreen(to[0], to[1]),
            target: engine.toScreen(target.cx, target.cy),
        };
    });

    await page.mouse.click(box!.x + geometry.click[0], box!.y + geometry.click[1]);
    await expect.poll(() => page.evaluate(() =>
        (window as unknown as { fixtureDiagram: { getSelection(): { linkIds: string[] } } })
            .fixtureDiagram.getSelection().linkIds)).toEqual([geometry.linkId]);

    await page.mouse.move(box!.x + geometry.endpoint[0], box!.y + geometry.endpoint[1]);
    await page.mouse.down();
    await page.mouse.move(box!.x + geometry.target[0], box!.y + geometry.target[1], { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => {
        const document = (window as unknown as {
            fixtureDiagram: { saveDocument(): { links: Array<{ id: string; to: { nodeId: string; portId: string } }> } };
        }).fixtureDiagram.saveDocument();
        return document.links.find((link) => link.id === document.links[0].id)?.to;
    })).toEqual({ nodeId: 'result', portId: 'fast' });

    await page.evaluate(() => (window as unknown as { fixtureDiagram: { undo(): void } }).fixtureDiagram.undo());
    await expect.poll(() => page.evaluate(() => {
        const document = (window as unknown as {
            fixtureDiagram: { saveDocument(): { links: Array<{ to: { nodeId: string; portId: string } }> } };
        }).fixtureDiagram.saveDocument();
        return document.links[0].to;
    })).toEqual({ nodeId: 'fast', portId: 'in' });
});

test('demo rewires a connected input in one drag without preselecting the link', async ({ page }) => {
    await page.goto('/demo/index.html');
    await page.waitForFunction(() =>
        (window as unknown as { stockSharpDiagramDemo?: unknown }).stockSharpDiagramDemo !== undefined);
    const canvas = page.locator('#diagram canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const geometry = await page.evaluate(() => {
        const facade = (window as unknown as { stockSharpDiagramDemo: unknown }).stockSharpDiagramDemo as {
            canvas: {
                links: Array<{ id: string; from: string; to: string }>;
                nodes: Array<{ id: string; inPorts: Array<{ id: string; cx: number; cy: number }> }>;
                endpoint(link: unknown, end: 'to'): [number, number];
                toScreen(x: number, y: number): [number, number];
            };
        };
        const engine = facade.canvas;
        const link = engine.links.find((candidate) => candidate.from === 'fast' && candidate.to === 'cross')!;
        const endpoint = engine.endpoint(link, 'to');
        const target = engine.nodes.find((node) => node.id === 'chart')!.inPorts
            .find((port) => port.id === 'object')!;
        return {
            linkId: link.id,
            endpoint: engine.toScreen(endpoint[0], endpoint[1]),
            target: engine.toScreen(target.cx, target.cy),
        };
    });

    await page.mouse.move(box!.x + geometry.endpoint[0], box!.y + geometry.endpoint[1]);
    await page.mouse.down();
    await page.mouse.move(box!.x + geometry.target[0], box!.y + geometry.target[1], { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => page.evaluate((linkId) => {
        const document = (window as unknown as {
            stockSharpDiagramDemo: {
                saveDocument(): { links: Array<{ id: string; to: { nodeId: string; portId: string } }> };
            };
        }).stockSharpDiagramDemo.saveDocument();
        return document.links.find((link) => link.id === linkId)?.to;
    }, geometry.linkId)).toEqual({ nodeId: 'chart', portId: 'object' });
    await expect(page.locator('#status')).toContainText('Relinked fast → chart.');
});
