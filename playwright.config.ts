import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'vite e2e/fixture --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /perf/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /perf/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /perf/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /perf/ },
    { name: 'perf', use: { ...devices['Desktop Chrome'] }, testMatch: /perf\.spec\.ts/ },
  ],
})
