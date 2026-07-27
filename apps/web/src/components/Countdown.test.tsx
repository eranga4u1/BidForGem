import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { remainingUntil } from "@/lib/format";
import { Countdown } from "./Countdown";

describe("Countdown", () => {
  it("computes remaining time from end_at (not a drifting local timer)", () => {
    const now = 1_000_000;
    expect(remainingUntil(new Date(now + 65_000), now).label).toBe("00:01:05");
    expect(remainingUntil(new Date(now + 90_061_000), now).label).toBe("1d 01:01:01");
    expect(remainingUntil(new Date(now - 1), now)).toEqual({ ended: true, label: "Ended" });
  });

  it("adopts an extended end_at immediately (anti-snipe)", () => {
    const base = Date.now();
    const { rerender } = render(<Countdown endAt={new Date(base + 30_000)} />);
    const before = screen.getByText(/\d\d:\d\d/).textContent ?? "";

    // Server extends the auction — parent passes a later end_at.
    rerender(<Countdown endAt={new Date(base + 120_000)} />);
    const after = screen.getByText(/\d\d:\d\d/).textContent ?? "";

    const toSeconds = (s: string): number => {
      const [m, sec] = s.split(":").map(Number);
      return (m ?? 0) * 60 + (sec ?? 0);
    };
    expect(toSeconds(after)).toBeGreaterThan(toSeconds(before));
  });
});
