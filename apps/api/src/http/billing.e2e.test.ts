import "reflect-metadata";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { users } from "../db/schema.js";
import { makeTestApi, type TestApi } from "../test/nest-app.js";

let api: TestApi;
let seq = 0;
const uniqueEmail = (): string => `b${++seq}-${Date.now()}@test.dev`;

beforeAll(async () => {
  api = await makeTestApi();
});
afterAll(async () => {
  await api.close();
});

const http = () => request(api.app.getHttpServer());

async function register(): Promise<{ token: string; id: string }> {
  const res = await http()
    .post("/auth/register")
    .send({ name: "User", email: uniqueEmail(), password: "Sapphire!Blue-42xz" });
  expect(res.status).toBe(201);
  const body = res.body as { tokens: { accessToken: string }; user: { id: string } };
  return { token: body.tokens.accessToken, id: body.user.id };
}

async function registerAdmin(): Promise<{ token: string; id: string }> {
  const admin = await register();
  await api.db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
  return admin;
}

async function draftGem(token: string): Promise<string> {
  const res = await http()
    .post("/gems")
    .set("authorization", `Bearer ${token}`)
    .send({ title: "Sapphire", type: "sapphire", carat: 2.5 });
  expect(res.status).toBe(201);
  return (res.body as { gem: { id: string } }).gem.id;
}

function publish(token: string, gemId: string) {
  return http().post(`/gems/${gemId}/publish`).set("authorization", `Bearer ${token}`);
}

describe("posting-fee gate e2e", () => {
  it("free by default: publish proceeds", async () => {
    const seller = await register();
    const res = await publish(seller.token, await draftGem(seller.token));
    expect(res.status).toBe(201);
  });

  it("non-admin cannot PATCH posting_fee (403)", async () => {
    const seller = await register();
    const res = await http()
      .patch("/admin/settings/posting_fee")
      .set("authorization", `Bearer ${seller.token}`)
      .send({ enabled: true, amount: 500, currency: "USD", free_until: null, free_quota: 0 });
    expect(res.status).toBe(403);
  });

  it("admin flips to paid; the SAME publish flow now requires payment (402) — data change only", async () => {
    const seller = await register();

    // Baseline: free -> publish OK.
    expect((await publish(seller.token, await draftGem(seller.token))).status).toBe(201);

    // Admin updates ONLY the settings row (invalidates cache).
    const admin = await registerAdmin();
    const patch = await http()
      .patch("/admin/settings/posting_fee")
      .set("authorization", `Bearer ${admin.token}`)
      .send({ enabled: true, amount: 500, currency: "USD", free_until: null, free_quota: 0 });
    expect(patch.status).toBe(200);

    // Same publish flow, no code change -> 402 Payment Required with the fee.
    const blocked = await publish(seller.token, await draftGem(seller.token));
    expect(blocked.status).toBe(402);
    const body = blocked.body as {
      error: {
        code: string;
        details: { fee: { amount: number; currency: string }; paymentIntentRef: string };
      };
    };
    expect(body.error.code).toBe("POSTING_FEE_REQUIRED");
    expect(body.error.details.fee).toEqual({ required: true, amount: 500, currency: "USD" });
    expect(body.error.details.paymentIntentRef).toMatch(/^pf_/);
  });
});
