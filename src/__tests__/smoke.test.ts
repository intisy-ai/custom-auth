import { describe, it, expect } from "vitest";
import { def } from "../handler.js";

describe("custom-auth scaffold", () => {
  it("declares provider id custom and exposes handleIr", async () => {
    expect(def.id).toBe("custom");
    const { handleIr } = await import("../handler.js");
    expect(typeof handleIr).toBe("function");
  });
});
