export type StorageVisibility = "public" | "private";

export interface UploadUrlRequest {
  key: string;
  contentType: string;
  maxSizeBytes: number;
  visibility: StorageVisibility;
  expiresInSeconds: number;
}

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ReadUrlRequest {
  key: string;
  visibility: StorageVisibility;
  expiresInSeconds: number;
}

export interface DeleteRequest {
  key: string;
  visibility: StorageVisibility;
}

/**
 * Object-storage abstraction. The client uploads/downloads DIRECTLY to storage
 * via these URLs — file bytes never stream through the API server.
 */
export interface StorageProvider {
  /** Presigned URL the client PUTs the file to. Constrains content type. */
  getUploadUrl(req: UploadUrlRequest): Promise<UploadTarget>;
  /** Short-lived signed download URL (used for private certificates). */
  getReadUrl(req: ReadUrlRequest): Promise<string>;
  delete(req: DeleteRequest): Promise<void>;
  /** Stable public URL for public objects; null for private ones. */
  publicUrl(key: string, visibility: StorageVisibility): string | null;
}
