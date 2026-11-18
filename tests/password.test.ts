import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

describe("passwords", () => {
  it("hashes with a fresh salt and verifies only the right password", async () => {
    const a = await hashPassword("Rice-store-2026");
    const b = await hashPassword("Rice-store-2026");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Rice-store-2026", a)).toBe(true);
    expect(await verifyPassword("rice-store-2026", a)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });
  it("asks for a reasonable password", () => {
    expect(passwordProblem("short1")).toMatch(/10 characters/);
    expect(passwordProblem("onlyletterslong")).toMatch(/letter and one number/);
    expect(passwordProblem("letters-and-1")).toBeNull();
  });
});
