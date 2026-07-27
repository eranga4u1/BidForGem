import { createHmac } from "node:crypto";
import type {
  DeleteRequest,
  ReadUrlRequest,
  StorageVisibility,
  UploadTarget,
  UploadUrlRequest,
} from "./provider.js";
import type { StorageProvider } from "./provider.js";

interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

/**
 * DEV storage that actually holds bytes in-process and is served over HTTP by
 * DevStorageController. Upload/read URLs point back at this API so the browser
 * can PUT/GET for real. Private (certificate) reads require an HMAC token, so
 * "not reachable without auth" holds: the token is only minted by the
 * auth-gated read-url endpoint.
 */
export interface LocalStorageProvider extends StorageProvider {
  readonly kind: "local";
  putObject(key: string, bytes: Buffer, contentType: string): void;
  getObject(key: string): StoredObject | null;
  verifyReadToken(key: string, expires: number, token: string): boolean;
}

export interface LocalStorageOptions {
  /** Public base URL of THIS API (e.g. http://localhost:4000). */
  baseUrl: string;
  secret?: string;
}

export function createLocalStorage(options: LocalStorageOptions): LocalStorageProvider {
  const base = options.baseUrl.replace(/\/+$/, "");
  const secret = options.secret ?? "dev-local-storage-secret";
  const objects = new Map<string, StoredObject>();

  // Key travels as a query param (avoids %2F-in-path routing issues).
  const objectUrl = (key: string): string => `${base}/dev-storage/o?key=${encodeURIComponent(key)}`;
  const sign = (key: string, expires: number): string =>
    createHmac("sha256", secret).update(`${key}:${expires}`).digest("hex");

  return {
    kind: "local",
    getUploadUrl(req: UploadUrlRequest): Promise<UploadTarget> {
      return Promise.resolve({
        url: objectUrl(req.key),
        method: "PUT",
        headers: { "content-type": req.contentType },
        expiresAt: new Date(Date.now() + req.expiresInSeconds * 1000),
      });
    },
    getReadUrl(req: ReadUrlRequest): Promise<string> {
      const expires = Date.now() + req.expiresInSeconds * 1000;
      const token = sign(req.key, expires);
      return Promise.resolve(`${objectUrl(req.key)}&expires=${expires}&token=${token}`);
    },
    delete(req: DeleteRequest): Promise<void> {
      objects.delete(req.key);
      return Promise.resolve();
    },
    publicUrl(key: string, visibility: StorageVisibility): string | null {
      return visibility === "public" ? objectUrl(key) : null;
    },
    putObject(key, bytes, contentType) {
      objects.set(key, { bytes, contentType });
    },
    getObject(key) {
      return objects.get(key) ?? null;
    },
    verifyReadToken(key, expires, token) {
      if (!Number.isFinite(expires) || Date.now() > expires) return false;
      return sign(key, expires) === token;
    },
  };
}
