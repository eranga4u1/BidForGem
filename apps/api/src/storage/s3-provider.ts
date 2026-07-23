import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  DeleteRequest,
  ReadUrlRequest,
  StorageProvider,
  StorageVisibility,
  UploadTarget,
  UploadUrlRequest,
} from "./provider.js";

export interface S3StorageConfig {
  region: string;
  /** Custom endpoint for S3-compatible storage (e.g. Cloudflare R2). */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Bucket for public objects (photos/videos). */
  publicBucket: string;
  /** Separate, non-public bucket for certificates. */
  privateBucket: string;
  /** CDN base URL that serves the public bucket. */
  publicBaseUrl: string;
  forcePathStyle?: boolean;
}

/**
 * S3-compatible storage (targeting Cloudflare R2 via the S3 API).
 *
 * Uploads are presigned PUTs with a pinned Content-Type, so the client cannot
 * change the MIME type. Certificates live in a separate private bucket and are
 * only ever reachable through short-lived signed GET URLs.
 */
export function createS3Storage(config: S3StorageConfig): StorageProvider {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle ?? false,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const bucketFor = (visibility: StorageVisibility): string =>
    visibility === "public" ? config.publicBucket : config.privateBucket;

  return {
    async getUploadUrl(req: UploadUrlRequest): Promise<UploadTarget> {
      const command = new PutObjectCommand({
        Bucket: bucketFor(req.visibility),
        Key: req.key,
        ContentType: req.contentType,
      });
      const url = await getSignedUrl(client, command, { expiresIn: req.expiresInSeconds });
      return {
        url,
        method: "PUT",
        headers: { "content-type": req.contentType },
        expiresAt: new Date(Date.now() + req.expiresInSeconds * 1000),
      };
    },

    getReadUrl(req: ReadUrlRequest): Promise<string> {
      const command = new GetObjectCommand({ Bucket: bucketFor(req.visibility), Key: req.key });
      return getSignedUrl(client, command, { expiresIn: req.expiresInSeconds });
    },

    async delete(req: DeleteRequest): Promise<void> {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucketFor(req.visibility), Key: req.key }),
      );
    },

    publicUrl(key: string, visibility: StorageVisibility): string | null {
      if (visibility !== "public") return null;
      return `${config.publicBaseUrl.replace(/\/+$/, "")}/${key}`;
    },
  };
}
