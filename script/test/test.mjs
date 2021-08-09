import { executeTestPlan, launchNode } from "@jsenv/core"

import * as jsenvConfig from "../../jsenv.config.mjs"

executeTestPlan({
  ...jsenvConfig,
  testPlan: {
    "test/**/*.test.mjs": {
      node: {
        launch: launchNode,
      },
    },
  },
  coverage: process.argv.includes("--coverage"),
  completedExecutionLogMerging: true,
})
