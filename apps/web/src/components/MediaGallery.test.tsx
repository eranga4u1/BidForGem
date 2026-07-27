import type { PublicMedia } from "@gem/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { media: { readUrl: vi.fn() } } }));

import { MediaGallery } from "./MediaGallery";

function media(over: Partial<PublicMedia>): PublicMedia {
  return {
    id: Math.random().toString(36).slice(2),
    gemId: "gem-1",
    type: "photo",
    mime: "image/jpeg",
    size: 1000,
    status: "ready",
    url: "https://cdn.example/x.jpg",
    createdAt: new Date(),
    ...over,
  };
}

describe("MediaGallery", () => {
  it("never renders pending media", () => {
    const { container } = render(
      <MediaGallery
        gemId="gem-1"
        authenticated
        media={[
          media({ status: "pending", url: null }),
          media({ status: "ready", url: "https://cdn.example/ready.jpg" }),
        ]}
      />,
    );
    const imgs = container.querySelectorAll("img");
    // Only the ready photo renders (main view); the pending one is excluded.
    expect(Array.from(imgs).every((i) => i.getAttribute("src") !== null)).toBe(true);
    expect(container.querySelector('img[src="https://cdn.example/ready.jpg"]')).toBeTruthy();
  });

  it("gates certificates behind authentication (no raw link when signed out)", () => {
    const cert = media({ type: "certificate", mime: "application/pdf", url: null });

    const anon = render(<MediaGallery gemId="gem-1" authenticated={false} media={[cert]} />);
    expect(anon.queryByText("View certificate")).toBeNull();
    expect(anon.getByText("Sign in to view")).toBeTruthy();
    anon.unmount();

    render(<MediaGallery gemId="gem-1" authenticated media={[cert]} />);
    expect(screen.getByText("View certificate")).toBeTruthy();
  });
});
