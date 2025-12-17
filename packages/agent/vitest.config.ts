import { mergeConfig, type UserConfigExport } from "vitest/config"
import shared from "../../vitest.shared.js"

const config: UserConfigExport = {
  test: {
    // Integration tests need longer timeout for API calls
    // Some graph queries can take 60+ seconds on the live API
    testTimeout: 90000,
    hookTimeout: 90000,
  }
}

export default mergeConfig(shared, config)
