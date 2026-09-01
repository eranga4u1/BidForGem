import { describe, expect, it } from "vitest";
import { authSessionResponseSchema, registerInputSchema, publicUserSchema } from "./auth.js";
import { publicGemSchema, uploadTicketSchema, requestUploadInputSchema } from "./gems.js";
import { publicMediaSchema } from "./gems.js";
import { publicAuctionSchema, bidHistoryItemSchema, createAuctionInputSchema } from "./auctions.js";
import { publicNotificationSchema } from "./notifications.js";
import { postingFeeValueSchema } from "./billing.js";
import { bidPlacedEventSchema } from "./socket.js";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ISO = "2026-01-02T03:04:05.000Z";

describe("contracts round-trip: one representative fixture per domain", () => {
  it("auth — session response", () => {
    const parsed = authSessionResponseSchema.parse({
      ok: true,
      user: {
        id: UUID,
        name: "Ada",
        email: "ada@example.com",
        role: "user",
        verified: true,
        createdAt: ISO,
      },
      tokens: {
        accessToken: "at",
        refreshToken: "rt",
        tokenType: "Bearer",
        expiresIn: 900,
      },
    });
    expect(parsed.user.email).toBe("ada@example.com");
    expect(parsed.user.createdAt).toBeInstanceOf(Date);
  });

  it("users — public user", () => {
    const parsed = publicUserSchema.parse({
      id: UUID,
      name: "Ada",
      email: "ada@example.com",
      role: "admin",
      verified: false,
      createdAt: ISO,
    });
    expect(parsed.role).toBe("admin");
  });

  it("gems — public gem", () => {
    const parsed = publicGemSchema.parse({
      id: UUID,
      sellerId: UUID,
      title: "Blue Sapphire",
      description: null,
      type: "sapphire",
      caratMilli: 2500,
      carat: 2.5,
      color: null,
      clarity: null,
      cut: null,
      origin: null,
      status: "active",
      createdAt: ISO,
      media: [],
    });
    expect(parsed.caratMilli).toBe(2500);
  });

  it("media — public media + upload ticket", () => {
    const media = publicMediaSchema.parse({
      id: UUID,
      gemId: UUID,
      type: "photo",
      mime: "image/jpeg",
      size: 1234,
      status: "ready",
      url: "https://cdn.example/x.jpg",
      createdAt: ISO,
    });
    expect(media.type).toBe("photo");

    const ticket = uploadTicketSchema.parse({
      mediaId: UUID,
      url: "https://storage.example/put",
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      expiresAt: ISO,
    });
    expect(ticket.expiresAt).toBeInstanceOf(Date);
  });

  it("auctions — public auction", () => {
    const parsed = publicAuctionSchema.parse({
      id: UUID,
      gemId: UUID,
      status: "active",
      currency: "USD",
      startPrice: 1000,
      reservePrice: null,
      minIncrement: 100,
      startAt: ISO,
      endAt: ISO,
      highestBid: null,
      bidCount: 0,
      antiSnipeWindowSeconds: 30,
      antiSnipeExtendSeconds: 30,
    });
    expect(parsed.currency).toBe("USD");
  });

  it("bids — history item", () => {
    const parsed = bidHistoryItemSchema.parse({
      id: UUID,
      amount: 1500,
      createdAt: ISO,
      bidderDisplayName: "Grace H.",
    });
    expect(parsed.amount).toBe(1500);
  });

  it("notifications — public notification", () => {
    const parsed = publicNotificationSchema.parse({
      id: UUID,
      type: "OUTBID",
      payload: { auctionId: UUID },
      readAt: null,
      createdAt: ISO,
    });
    expect(parsed.type).toBe("OUTBID");
  });

  it("settings — posting fee value (defaults applied)", () => {
    const parsed = postingFeeValueSchema.parse({
      enabled: true,
      amount: 500,
      currency: "usd",
    });
    expect(parsed.currency).toBe("USD"); // toUpperCase pipe
    expect(parsed.free_until).toBeNull();
    expect(parsed.free_quota).toBe(0);
  });

  it("socket — bid:placed keeps endAt as an ISO string", () => {
    const parsed = bidPlacedEventSchema.parse({
      auctionId: UUID,
      amount: 1500,
      bidderDisplayName: "Grace H.",
      highestBid: 1500,
      bidCount: 3,
      endAt: ISO,
    });
    expect(parsed.endAt).toBe(ISO);
  });
});

describe("contracts reject known-bad payloads", () => {
  it("rejects a weak password on register", () => {
    const result = registerInputSchema.safeParse({
      name: "Ada",
      email: "ada@example.com",
      password: "password", // trivial + too few character classes
    });
    expect(result.success).toBe(false);
  });

  it("rejects a public user missing a valid email", () => {
    const result = publicUserSchema.safeParse({
      id: UUID,
      name: "Ada",
      email: "not-an-email",
      role: "user",
      verified: true,
      createdAt: ISO,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an auction duration below the minimum", () => {
    const result = createAuctionInputSchema.safeParse({
      gemId: UUID,
      startPrice: 1000,
      minIncrement: 100,
      currency: "USD",
      durationSeconds: 1, // below AUCTION_MIN_DURATION_SECONDS
    });
    expect(result.success).toBe(false);
  });

  it("rejects an upload request with a non-positive size", () => {
    const result = requestUploadInputSchema.safeParse({
      type: "photo",
      mime: "image/jpeg",
      sizeBytes: 0,
    });
    expect(result.success).toBe(false);
  });
});
