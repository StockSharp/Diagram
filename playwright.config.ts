import { defineConfig } from '@playwright/test';

const port = 8792;

export default defineConfig({
    testDir: './tests/browser',
    outputDir: './test-results',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
    projects: [
        { name: 'chromium-dpr1', use: { deviceScaleFactor: 1 } },
        { name: 'chromium-dpr2', use: { deviceScaleFactor: 2 } },
    ],
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        browserName: 'chromium',
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        viewport: { width: 1_440, height: 900 },
        colorScheme: 'dark',
        locale: 'en-US',
        timezoneId: 'UTC',
        actionTimeout: 5_000,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'node serve.mjs',
        url: `http://127.0.0.1:${port}/tests/browser/fixtures/component.html`,
        env: {
            DIAGRAM_HOST: '127.0.0.1',
            DIAGRAM_PORT: String(port),
        },
        reuseExistingServer: !process.env.CI,
        timeout: 20_000,
    },
});
