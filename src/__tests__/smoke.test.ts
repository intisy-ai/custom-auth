import { describe, it, expect } from "vitest";

describe("custom-auth scaffold", () => {
  it("exposes handleIr", async () => {
    const { handleIr } = await import("../handler.js");
    expect(typeof handleIr).toBe("function");
  });
});
