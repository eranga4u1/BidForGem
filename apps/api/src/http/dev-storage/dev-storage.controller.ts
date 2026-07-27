import { Controller, Get, HttpException, Inject, Put, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { LocalStorageProvider } from "../../storage/local-provider.js";
import type { StorageProvider } from "../../storage/provider.js";
import { STORAGE } from "../tokens.js";

function asLocal(storage: StorageProvider): LocalStorageProvider | null {
  return (storage as { kind?: string }).kind === "local" ? (storage as LocalStorageProvider) : null;
}

/**
 * DEV-only object storage endpoint. Functions only with the local storage
 * provider (dev); otherwise 404. Certificate objects require the HMAC token
 * minted by the auth-gated read-url endpoint, so they are not reachable raw.
 */
@Controller("dev-storage")
export class DevStorageController {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}

  @Put("o")
  async put(@Query("key") key: string, @Req() req: Request): Promise<{ ok: true }> {
    const local = asLocal(this.storage);
    if (!local || !key) throw new HttpException("Not available", 404);
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
    local.putObject(
      key,
      Buffer.concat(chunks),
      req.headers["content-type"] ?? "application/octet-stream",
    );
    return { ok: true };
  }

  @Get("o")
  get(
    @Query("key") key: string,
    @Query("expires") expires: string | undefined,
    @Query("token") token: string | undefined,
    @Res() res: Response,
  ): void {
    const local = asLocal(this.storage);
    if (!local || !key) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
      return;
    }
    if (key.startsWith("certificates/")) {
      const valid =
        token !== undefined &&
        expires !== undefined &&
        local.verifyReadToken(key, Number(expires), token);
      if (!valid) {
        res
          .status(403)
          .json({ error: { code: "FORBIDDEN", message: "A signed URL is required." } });
        return;
      }
    }
    const object = local.getObject(key);
    if (!object) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
      return;
    }
    res.setHeader("content-type", object.contentType);
    res.setHeader("access-control-allow-origin", "*");
    res.send(object.bytes);
  }
}
