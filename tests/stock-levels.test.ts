import { describe, expect, it } from "vitest";
import { alertToSend, defaultLowAt, stockLevel } from "@/lib/stock-levels";

describe("stock tracker levels", () => {
  it("classifies free bags against the running-low level", () => {
    expect(stockLevel(0, 5)).toBe("OUT");
    expect(stockLevel(-2, 5)).toBe("OUT");
    expect(stockLevel(5, 5)).toBe("LOW");
    expect(stockLevel(6, 5)).toBe("OK");
    expect(defaultLowAt(50)).toBe(5);
    expect(defaultLowAt(1)).toBe(10);
  });
  it("sends each alert once and re-arms after restocking", () => {
    expect(alertToSend("LOW", { low: false, out: false })).toBe("LOW");
    expect(alertToSend("LOW", { low: true, out: false })).toBeNull();
    expect(alertToSend("OUT", { low: true, out: false })).toBe("OUT");
    expect(alertToSend("OUT", { low: true, out: true })).toBeNull();
    expect(alertToSend("OK", { low: true, out: true })).toBe("CLEAR");
    expect(alertToSend("OK", { low: false, out: false })).toBeNull();
  });
});
