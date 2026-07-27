"use client";

import { useEffect, useState } from "react";
import { remainingUntil } from "@/lib/format";

/**
 * Server-authoritative countdown: always computed from the `endAt` prop and the
 * current wall clock — never an accumulating local timer that drifts. When the
 * parent adopts a new end_at (anti-snipe extension), this re-renders and the
 * countdown jumps immediately.
 */
export function Countdown({
  endAt,
  ended = false,
}: {
  endAt: Date;
  ended?: boolean;
}): React.ReactElement {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (ended) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ended, endAt]);

  const r = ended ? { ended: true, label: "Ended" } : remainingUntil(endAt, now);
  const urgent = !r.ended && endAt.getTime() - now < 60_000;
  return <span className={`countdown mono ${urgent ? "urgent" : ""}`}>{r.label}</span>;
}
