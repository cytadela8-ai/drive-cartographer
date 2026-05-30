import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Prisma schema", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  it("defines the concrete explorer indexes", () => {
    expect(schema).toContain("@@index([scanId, rootId, parentRelativePath])");
    expect(schema).toContain("@@unique([scanId, rootId, relativePath])");
    expect(schema).toContain("@@index([hashId])");
    expect(schema).toContain("@@index([rootId, relativePath, scanId])");
  });

  it("keeps datasource URL out of schema for Prisma 7 config", () => {
    expect(schema).toContain('provider = "postgresql"');
    expect(schema).not.toContain("url =");
  });
});
