// Universal plugin contract via core's shared test-kit.
import { runPluginContract } from "@intisy-ai/basekit/testing";

runPluginContract({
  name: "custom-auth",
  entry: "dist/index.js",
  configName: "custom-auth",
});
