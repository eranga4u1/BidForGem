import { describe, expect, it } from "vitest";
import { addMoney, DEFAULT_CURRENCY, formatMoney, money } from "./money.js";

describe("money", () => {
  it("constructs from integer minor units", () => {
    const m = money(1500, "USD");
    expect(m.amount).toBe(1500);
    expect(m.currency).toBe("USD");
  });

  it("rejects non-integer (float) amounts", () => {
    expect(() => money(15.5, "USD")).toThrow();
  });

  it("rejects negative amounts", () => {
    expect(() => money(-1, "USD")).toThrow();
  });

  it("rejects malformed currency codes", () => {
    expect(() => money(100, "usd")).toThrow();
    expect(() => money(100, "US")).toThrow();
  });

  it("adds amounts of the same currency", () => {
    expect(addMoney(money(100, "USD"), money(250, "USD")).amount).toBe(350);
  });

  it("refuses to add across currencies", () => {
    expect(() => addMoney(money(100, "USD"), money(100, "EUR"))).toThrow(/mismatch/i);
  });
});

describe("formatMoney", () => {
  it("renders LKR as Rs. with no decimals for whole rupees", () => {
    expect(formatMoney(150000, "LKR")).toBe("Rs. 1,500");
    expect(formatMoney(150000000, "LKR")).toBe("Rs. 1,500,000");
    expect(formatMoney(0, "LKR")).toBe("Rs. 0");
  });

  it("keeps two decimals when an LKR amount has cents", () => {
    expect(formatMoney(150050, "LKR")).toBe("Rs. 1,500.50");
  });

  it("uses Intl for other currencies", () => {
    expect(formatMoney(150000, "USD")).toBe("$1,500.00");
  });

  it("makes LKR the marketplace currency", () => {
    expect(DEFAULT_CURRENCY).toBe("LKR");
  });
});
