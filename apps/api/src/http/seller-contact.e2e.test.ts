import "reflect-metadata";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTestApi, type TestApi } from "../test/nest-app.js";

/**
 * Seller name + contact numbers on listings, end to end over HTTP — including
 * the optional-auth guard that decides whether the viewer is signed in, which
 * is what gates disclosure of the numbers.
 */
let api: TestApi;
let seq = 0;
const uniqueEmail = (): string => `c${++seq}-${Date.now()}@test.dev`;

beforeAll(async () => {
  api = await makeTestApi();
});
afterAll(async () => {
  await api.close();
});

const http = () => request(api.app.getHttpServer());

async function register(phone?: string): Promise<{ token: string; id: string }> {
  const res = await http()
    .post("/auth/register")
    .send({
      name: "Sam Seller",
      email: uniqueEmail(),
      password: "Sapphire!Blue-42xz",
      ...(phone ? { phone } : {}),
    });
  expect(res.status).toBe(201);
  const body = res.body as { tokens: { accessToken: string }; user: { id: string } };
  return { token: body.tokens.accessToken, id: body.user.id };
}

async function draftGem(token: string): Promise<string> {
  const res = await http()
    .post("/gems")
    .set("authorization", `Bearer ${token}`)
    .send({ title: "Blue Sapphire", type: "sapphire", carat: 2.5 });
  expect(res.status).toBe(201);
  return (res.body as { gem: { id: string } }).gem.id;
}

const publish = (token: string, gemId: string) =>
  http().post(`/gems/${gemId}/publish`).set("authorization", `Bearer ${token}`);

type Detail = { gem: { seller: { name: string; phones: string[] | null } } };

describe("seller contact numbers", () => {
  it("requires a contact number to publish; adding one via the profile unblocks it", async () => {
    const seller = await register(); // no phone at sign-up
    const gemId = await draftGem(seller.token);

    const blocked = await publish(seller.token, gemId);
    expect(blocked.status).toBe(409);
    expect((blocked.body as { error: { code: string } }).error.code).toBe("CONTACT_REQUIRED");

    const saved = await http()
      .patch("/auth/me")
      .set("authorization", `Bearer ${seller.token}`)
      .send({ name: "Sam Seller", phone: "077 123 4567" });
    expect(saved.status).toBe(200);

    expect((await publish(seller.token, gemId)).status).toBe(201);
  });

  it("shows the seller's name to everyone but numbers only to signed-in viewers", async () => {
    const seller = await register("077 123 4567");
    await http()
      .patch("/auth/me")
      .set("authorization", `Bearer ${seller.token}`)
      .send({ name: "Sam Seller", phone2: "+94 11 234 5678" });
    const gemId = await draftGem(seller.token);
    expect((await publish(seller.token, gemId)).status).toBe(201);

    const anon = await http().get(`/gems/${gemId}`);
    expect(anon.status).toBe(200);
    expect((anon.body as Detail).gem.seller).toEqual({ name: "Sam Seller", phones: null });

    const buyer = await register();
    const signedIn = await http()
      .get(`/gems/${gemId}`)
      .set("authorization", `Bearer ${buyer.token}`);
    expect((signedIn.body as Detail).gem.seller).toEqual({
      name: "Sam Seller",
      phones: ["077 123 4567", "+94 11 234 5678"],
    });
  });

  it("never exposes seller numbers on the browse list (no bulk harvesting)", async () => {
    const seller = await register("077 765 4321");
    const gemId = await draftGem(seller.token);
    expect((await publish(seller.token, gemId)).status).toBe(201);

    const buyer = await register();
    const list = await http().get("/gems").set("authorization", `Bearer ${buyer.token}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain("077 765 4321");
  });

  it("profile update: omitted numbers are kept, blank clears, invalid is rejected", async () => {
    const user = await register("077 111 2222");
    const me = (token: string) => http().get("/auth/me").set("authorization", `Bearer ${token}`);
    const patch = (body: object) =>
      http().patch("/auth/me").set("authorization", `Bearer ${user.token}`).send(body);

    // Name-only update (e.g. an older app build) keeps the stored number.
    expect((await patch({ name: "Renamed" })).status).toBe(200);
    expect((await me(user.token)).body.user).toMatchObject({
      name: "Renamed",
      phone: "077 111 2222",
    });

    expect((await patch({ name: "Renamed", phone: "abc" })).status).toBe(400);

    expect((await patch({ name: "Renamed", phone: "" })).status).toBe(200);
    expect((await me(user.token)).body.user.phone).toBeNull();
  });
});
