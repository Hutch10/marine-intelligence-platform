import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("web client boundary", () => {
  it("trust-utils does not re-export server-only harness primitives", () => {
    const source = readFileSync(join(here, "trust-utils.ts"), "utf8");
    expect(source).not.toMatch(/export \* from ["']@marine\/shared["']/);
    expect(source).not.toMatch(/harness-primitives/);
    expect(source).not.toMatch(/@marine\/shared\/server/);
  });

  it("shared index does not export harness-primitives", () => {
    const indexSource = readFileSync(
      join(here, "../../../packages/shared/src/index.ts"),
      "utf8",
    );
    expect(indexSource).not.toMatch(/harness-primitives/);
  });
});
