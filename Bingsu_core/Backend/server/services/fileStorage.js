import fs from "fs/promises";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  fileStorageProvider,
  s3AccessKeyId,
  s3Bucket,
  s3Endpoint,
  s3ForcePathStyle,
  s3PublicUrl,
  s3Region,
  s3SecretAccessKey,
} from "../config.js";

const localRoot = path.join(process.cwd(), ".files");

const ensureLocalRoot = async () => {
  await fs.mkdir(localRoot, { recursive: true }).catch(() => null);
};

const useS3 = fileStorageProvider === "s3";
const s3Client = useS3
  ? new S3Client({
      region: s3Region,
      endpoint: s3Endpoint || undefined,
      credentials: s3AccessKeyId && s3SecretAccessKey
        ? { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey }
        : undefined,
      forcePathStyle: s3ForcePathStyle,
    })
  : null;

const safeName = (name) => name.replace(/[^\w.\-() ]+/g, "_");

export const storeOriginalFile = async ({ buffer, fileName, contentType, userId, documentId }) => {
  const sanitized = safeName(fileName || "file");
  const storedAt = new Date().toISOString();

  if (useS3) {
    if (!s3Bucket) {
      throw new Error("Missing S3_BUCKET for file storage");
    }
    const key = `${userId}/${documentId}/${Date.now()}-${sanitized}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    }));
    return {
      provider: "s3",
      bucket: s3Bucket,
      key,
      url: s3PublicUrl ? `${s3PublicUrl.replace(/\/$/, "")}/${key}` : null,
      storedAt,
    };
  }

  await ensureLocalRoot();
  const targetDir = path.join(localRoot, userId, documentId);
  await fs.mkdir(targetDir, { recursive: true }).catch(() => null);
  const targetPath = path.join(targetDir, sanitized);
  await fs.writeFile(targetPath, buffer);
  return {
    provider: "local",
    path: targetPath,
    storedAt,
  };
};
