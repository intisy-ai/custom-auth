// Universal plugin contract via core's shared test-kit.
import { runPluginContract } from "../../core/src/testing.js";

runPluginContract({
  name: "custom-auth",
  entry: "dist/index.js",
  configName: "custom-auth",
});
