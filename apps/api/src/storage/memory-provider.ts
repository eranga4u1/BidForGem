import type {
  DeleteRequest,
  ReadUrlRequest,
  StorageProvider,
  StorageVisibility,
  UploadTarget,
  UploadUrlRequest,
} from "./provider.js";

export interface StoredObjectMeta {
  contentType: string;
  maxSizeBytes: number;
  visibility: StorageVisibility;
}

export interface MemoryStorage extends StorageProvider {
  /** Recorded objects for which an upload URL was issued (test introspection). */
  readonly objects: Map<string, StoredObjectMeta>;
}

export interface MemoryStorageOptions {
  publicBaseUrl?: string;
  signingBaseUrl?: string;
}

/**
 * In-memory storage fake for tests. Never touches the network. Records the
 * constraints it was asked to sign so tests can assert on them, and mints
 * distinguishable public vs signed URLs.
 */
export function createMemoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
  const publicBase = (options.publicBaseUrl ?? "https://cdn.gem.test").replace(/\/+$/, "");
  const signBase = (options.signingBaseUrl ?? "https://storage.gem.test").replace(/\/+$/, "");
  const objects = new Map<string, StoredObjectMeta>();

  return {
    objects,
    getUploadUrl(req: UploadUrlRequest): Promise<UploadTarget> {
      objects.set(req.key, {
        contentType: req.contentType,
        maxSizeBytes: req.maxSizeBytes,
        visibility: req.visibility,
      });
      const expiresAt = new Date(Date.now() + req.expiresInSeconds * 1000);
      const url =
        `${signBase}/upload/${encodeURIComponent(req.key)}` +
        `?contentType=${encodeURIComponent(req.contentType)}&maxBytes=${req.maxSizeBytes}` +
        `&expires=${expiresAt.getTime()}`;
      return Promise.resolve({
        url,
        method: "PUT",
        headers: { "content-type": req.contentType },
        expiresAt,
      });
    },
    getReadUrl(req: ReadUrlRequest): Promise<string> {
      const expires = Date.now() + req.expiresInSeconds * 1000;
      if (req.visibility === "public") {
        return Promise.resolve(`${publicBase}/${req.key}`);
      }
      const sig = Math.random().toString(36).slice(2);
      return Promise.resolve(
        `${signBase}/signed/${encodeURIComponent(req.key)}?expires=${expires}&sig=${sig}`,
      );
    },
    delete(req: DeleteRequest): Promise<void> {
      objects.delete(req.key);
      return Promise.resolve();
    },
    publicUrl(key: string, visibility: StorageVisibility): string | null {
      return visibility === "public" ? `${publicBase}/${key}` : null;
    },
  };
}
