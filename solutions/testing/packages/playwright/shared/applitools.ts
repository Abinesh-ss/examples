import { test as base } from '@playwright/test'
import {
  BatchInfo,
  Configuration,
  VisualGridRunner,
  BrowserType,
  DeviceName,
  ScreenOrientation,
  Eyes,
  BatchInfoPlain,
  RectangleSizePlain,
} from '@applitools/eyes-playwright'

const noop = () => {}

export type ApplitoolsConfig = {
  applitoolsEyes: boolean
}

export type ApplitoolsExtensions = ApplitoolsConfig & {
  applitools: Partial<ApplitoolsOptions>
  eyes: Eyes
}

export type ApplitoolsOptions = {
  appName: string
  viewportSize?: RectangleSizePlain
  batchInfo?: BatchInfoPlain
}

export const applitoolsTest = (options: ApplitoolsOptions) => {
  // Applitools objects to share for all tests
  let batch: BatchInfo
  let config: Configuration
  let runner: VisualGridRunner

  const test = base.extend<ApplitoolsExtensions>({
    // If true, Applitools will be enabled for the test.
    applitoolsEyes: [false, { option: true }],
    applitools: [options, { option: true }],
    eyes: async ({ applitoolsEyes, applitools, page }, use, testInfo) => {
      if (!process.env.APPLITOOLS_API_KEY || !applitoolsEyes) {
        return use({ check: noop } as Eyes)
      }

      const eyes = new Eyes(runner, config)

      // Open Eyes to start visual testing.
      // Each test should open its own Eyes for its own snapshots.
      // It is a recommended practice to set all four inputs below:
      await eyes.open(
        // The Playwright page object to "watch"
        page,

        // The name of the application under test.
        // All tests for the same app should share the same app name.
        // Set this name wisely: Applitools features rely on a shared app name across tests.
        applitools.appName || options.appName,

        // The name of the test case for the given application.
        // Additional unique characteristics of the test may also be specified as part of the test name,
        // such as localization information ("Home Page - EN") or different user permissions ("Login by admin").
        testInfo.title,

        // The viewport size for the local browser.
        // Eyes will resize the web browser to match the requested viewport size.
        // This parameter is optional but encouraged in order to produce consistent results.
        applitools.viewportSize ||
          options.viewportSize || { width: 1024, height: 768 }
      )

      await use(eyes)
    },
  })

  if (!process.env.APPLITOOLS_API_KEY) {
    console.warn('Applitools API key not found. Skipping visual tests.')
    return test
  }

  test.beforeAll(({ applitoolsEyes, applitools }, testInfo) => {
    if (!applitoolsEyes) return

    // Create the runner for the Ultrafast Grid.
    // Concurrency refers to the number of visual checkpoints Applitools will perform in parallel.
    // Warning: If you have a free account, then concurrency will be limited to 1.
    runner = new VisualGridRunner({ testConcurrency: 5 })

    const { titlePath } = testInfo
    // If `titlePath` looks like: ['todo.spec.ts', 'Todo Page', 'should do something']
    // We'll set the name to "Todo Page". If the length is 2 it will be "todo.spec.ts" instead.
    const name = titlePath
      .slice(titlePath.length > 2 ? 1 : 0, titlePath.length - 1)
      .join(' - ')

    // Create a new batch for tests.
    // A batch is the collection of visual checkpoints for a test suite.
    // Batches are displayed in the Eyes Test Manager, so use meaningful names.
    batch = new BatchInfo({
      name,
      ...options.batchInfo,
      ...applitools.batchInfo,
    })

    // Create a configuration for Applitools Eyes.
    config = new Configuration()

    // Set the batch for the config.
    config.setBatch(batch)

    // Add 3 desktop browsers with different viewports for cross-browser testing in the Ultrafast Grid.
    // Other browsers are also available, like Edge and IE.
    config.addBrowser(1600, 1200, BrowserType.CHROME)
    config.addBrowser(1024, 768, BrowserType.SAFARI)
    config.addBrowser(800, 600, BrowserType.FIREFOX)

    // Add 2 mobile emulation devices with different orientations
    config.addDeviceEmulation(DeviceName.iPhone_11, ScreenOrientation.PORTRAIT)
    config.addDeviceEmulation(DeviceName.Pixel_3, ScreenOrientation.LANDSCAPE)
  })

  test.afterEach(async ({ applitoolsEyes, eyes }) => {
    if (!applitoolsEyes) return

    // Close Eyes to tell the server it should display the results.
    await eyes.closeAsync()

    // Warning: `eyes.closeAsync()` will NOT wait for visual checkpoints to complete.
    // You will need to check the Eyes Test Manager for visual results per checkpoint.
    // Note that "unresolved" and "failed" visual checkpoints will not cause the Playwright test to fail.

    // If you want the Playwright test to wait synchronously for all checkpoints to complete, then use `eyes.close()`.
    // If any checkpoints are unresolved or failed, then `eyes.close()` will make the Playwright test fail.
  })

  test.afterAll(async ({ applitoolsEyes }) => {
    if (!applitoolsEyes) return

    // Close the batch and force Playwright to wait synchronously for all visual checkpoints to complete.
    await runner.getAllTestResults()
  })

  return test
}
