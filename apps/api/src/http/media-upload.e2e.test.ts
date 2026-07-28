import "reflect-metadata";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertGem } from "../test/harness.js";
import { makeTestApi, type TestApi } from "../test/nest-app.js";
import { createLocalStorage } from "../storage/local-provider.js";

/**
 * Covers the hop the in-process media-service tests skip: the REAL HTTP round
 * trip through the pre-signed PUT and the dev-storage read endpoint against the
 * LOCAL provider — the exact path the browser takes (client PUT → complete →
 * <img> GET). The service-level tests never hit DevStorageController, so a
 * provider that stored nothing, dropped bytes, or lost the content-type would
 * pass them yet break in the browser.
 */
let api: TestApi;
let seq = 0;

beforeAll(async () => {
  // Real local provider (holds bytes in-process, served over HTTP), exactly as
  // `dev:api` wires it for the browser.
  api = await makeTestApi({ storage: createLocalStorage({ baseUrl: "http://127.0.0.1" }) });
});
afterAll(async () => {
  await api.close();
});

const http = () => request(api.app.getHttpServer());
const pathOf = (url: string): string => {
  const u = new URL(url);
  return u.pathname + u.search;
};

/** supertest parser that accumulates a binary response body into a Buffer. */
function binaryParser(res: request.Response, cb: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  const stream = res as unknown as NodeJS.ReadableStream;
  stream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
  stream.on("end", () => cb(null, Buffer.concat(chunks)));
}

async function seller(): Promise<{ token: string; id: string }> {
  const email = `seller${++seq}-${Date.now()}@test.dev`;
  const res = await http()
    .post("/auth/register")
    .send({ name: "Seller", email, password: "Sapphire!Blue-42xz" });
  expect(res.status).toBe(201);
  const body = res.body as { tokens: { accessToken: string }; user: { id: string } };
  return { token: body.tokens.accessToken, id: body.user.id };
}

describe("media upload — real HTTP round trip (local storage)", () => {
  it("PUT-back bytes are served byte-for-byte at the ready photo URL", async () => {
    const s = await seller();
    const gem = await insertGem(api.db, s.id, { status: "active" });
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 253, 254, 255,
    ]);

    // 1. request the pre-signed upload target
    const ticketRes = await http()
      .post(`/gems/${gem.id}/media/upload-url`)
      .set("authorization", `Bearer ${s.token}`)
      .send({ type: "photo", mime: "image/png", sizeBytes: bytes.length, filename: "g.png" });
    expect(ticketRes.status).toBe(201);
    const ticket = (ticketRes.body as { ticket: { mediaId: string; url: string } }).ticket;

    // 2. client PUT the bytes straight to storage
    const putRes = await http()
      .put(pathOf(ticket.url))
      .set("content-type", "image/png")
      .send(bytes);
    expect(putRes.status).toBe(200);

    // 3. complete → media flips to ready and exposes its public URL
    const completeRes = await http()
      .post(`/gems/${gem.id}/media/${ticket.mediaId}/complete`)
      .set("authorization", `Bearer ${s.token}`);
    expect(completeRes.status).toBe(201);
    const media = (completeRes.body as { media: { status: string; url: string } }).media;
    expect(media.status).toBe("ready");

    // 4. GET the public URL → the SAME bytes come back, with the content-type
    const getRes = await http().get(pathOf(media.url)).buffer(true).parse(binaryParser);
    expect(getRes.status).toBe(200);
    expect(getRes.headers["content-type"]).toContain("image/png");
    expect(getRes.body.equals(bytes)).toBe(true);
  });

  it("a certificate object is not reachable raw, but is via its signed URL", async () => {
    const s = await seller();
    const gem = await insertGem(api.db, s.id, { status: "active" });
    const bytes = Buffer.from("%PDF-1.4 fake certificate bytes");

    const ticketRes = await http()
      .post(`/gems/${gem.id}/media/upload-url`)
      .set("authorization", `Bearer ${s.token}`)
      .send({
        type: "certificate",
        mime: "application/pdf",
        sizeBytes: bytes.length,
        filename: "c.pdf",
      });
    const ticket = (ticketRes.body as { ticket: { mediaId: string; url: string } }).ticket;

    expect(
      (await http().put(pathOf(ticket.url)).set("content-type", "application/pdf").send(bytes))
        .status,
    ).toBe(200);
    expect(
      (
        await http()
          .post(`/gems/${gem.id}/media/${ticket.mediaId}/complete`)
          .set("authorization", `Bearer ${s.token}`)
      ).status,
    ).toBe(201);

    // Raw GET of the private key (no token) is refused.
    const rawKey = `certificates/${gem.id}/${ticket.mediaId}`;
    const rawRes = await http().get(`/dev-storage/o`).query({ key: rawKey });
    expect(rawRes.status).toBe(403);

    // The auth-gated read-url mints a signed URL that DOES serve the bytes.
    const readUrlRes = await http()
      .get(`/gems/${gem.id}/media/${ticket.mediaId}/url`)
      .set("authorization", `Bearer ${s.token}`);
    expect(readUrlRes.status).toBe(200);
    const signed = (readUrlRes.body as { url: string }).url;
    const signedRes = await http().get(pathOf(signed)).buffer(true).parse(binaryParser);
    expect(signedRes.status).toBe(200);
    expect(signedRes.body.equals(bytes)).toBe(true);
  });
});
