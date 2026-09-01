/**
 * One-shot: apply a CORS policy to R2/S3 bucket(s) so the browser can upload
 * directly via presigned PUT URLs. Uses @aws-sdk/client-s3 (already a dep).
 *
 * Run from the repo root (resolves the SDK from apps/api/node_modules):
 *
 *   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
 *   S3_ACCESS_KEY_ID=<r2 access key> \
 *   S3_SECRET_ACCESS_KEY=<r2 secret> \
 *   CORS_ORIGINS=https://bidforgem-1.onrender.com,http://localhost:3000 \
 *   BUCKETS=gem-public \
 *   node apps/api/scripts/set-r2-cors.mjs
 *
 * BUCKETS defaults to "gem-public". Add gem-private too once it exists.
 */
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error("Missing env. Required: S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.");
  process.exit(1);
}

const origins = (
  process.env.CORS_ORIGINS ?? "https://bidforgem-1.onrender.com,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const buckets = (process.env.BUCKETS ?? "gem-public")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const client = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

const CORSRules = [
  {
    AllowedOrigins: origins,
    AllowedMethods: ["PUT", "GET", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  },
];

for (const Bucket of buckets) {
  try {
    await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules } }));
    const check = await client.send(new GetBucketCorsCommand({ Bucket }));
    console.log(`✅ ${Bucket}: CORS applied. Origins: ${origins.join(", ")}`);
    console.log(JSON.stringify(check.CORSRules, null, 2));
  } catch (err) {
    console.error(`❌ ${Bucket}: ${err?.name ?? "Error"} — ${err?.message ?? err}`);
  }
}
