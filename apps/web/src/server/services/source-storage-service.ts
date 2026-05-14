import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

export interface EncryptedSourcePayload {
  algorithm: "aes-256-gcm"
  iv: string
  tag: string
  ciphertext: Buffer
}

interface SourceCryptoContext {
  projectId: string
  sourceId: string
  versionId: string
  masterKey?: string | null
}

function getMasterKey(input?: string | null) {
  const key = input ?? process.env.RELAY_SOURCE_ENCRYPTION_KEY ?? process.env.RELAY_CONTENT_ENCRYPTION_KEY
  if (!key) {
    throw new Error("RELAY_SOURCE_ENCRYPTION_KEY or RELAY_CONTENT_ENCRYPTION_KEY is required for source encryption.")
  }
  return key
}

function deriveSourceKey(context: SourceCryptoContext) {
  return createHash("sha256")
    .update(getMasterKey(context.masterKey))
    .update(":")
    .update(context.projectId)
    .update(":")
    .update(context.sourceId)
    .update(":")
    .update(context.versionId)
    .digest()
}

function aad(context: SourceCryptoContext) {
  return Buffer.from(`${context.projectId}:${context.sourceId}:${context.versionId}`, "utf8")
}

export function encryptSourceBuffer(buffer: Buffer, context: SourceCryptoContext): EncryptedSourcePayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveSourceKey(context), iv)
  cipher.setAAD(aad(context))
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()])
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext,
  }
}

export function decryptSourceBuffer(payload: EncryptedSourcePayload, context: SourceCryptoContext): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", deriveSourceKey(context), Buffer.from(payload.iv, "base64url"))
  decipher.setAAD(aad(context))
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"))
  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()])
}

export function buildSourceObjectKey(input: {
  projectId: string
  sourceId: string
  versionId: string
  extension: string
}) {
  const extension = input.extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"
  return `projects/${input.projectId}/sources/${input.sourceId}/versions/${input.versionId}/original.${extension}`
}

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT ?? process.env.S3_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null
  }
  return new S3Client({
    region: process.env.R2_REGION ?? process.env.S3_REGION ?? "auto",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function getBucket() {
  return process.env.R2_BUCKET ?? process.env.S3_BUCKET ?? null
}

export async function putEncryptedSourceObject(input: {
  key: string
  buffer: Buffer
  contentType: string
  crypto: SourceCryptoContext
}) {
  const client = getR2Client()
  const bucket = getBucket()
  if (!client || !bucket) {
    throw new Error("R2 source storage is not configured.")
  }
  const encrypted = encryptSourceBuffer(input.buffer, input.crypto)
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: encrypted.ciphertext,
    ContentType: "application/octet-stream",
    Metadata: {
      "relay-content-type": input.contentType,
      "relay-enc-alg": encrypted.algorithm,
      "relay-enc-iv": encrypted.iv,
      "relay-enc-tag": encrypted.tag,
    },
  }))
  return encrypted
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body || typeof body !== "object" || !("transformToByteArray" in body)) {
    throw new Error("R2 object response body is not readable.")
  }
  const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()
  return Buffer.from(bytes)
}

export async function getDecryptedSourceObject(input: {
  key: string
  crypto: SourceCryptoContext
}) {
  const client = getR2Client()
  const bucket = getBucket()
  if (!client || !bucket) {
    throw new Error("R2 source storage is not configured.")
  }
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: input.key }))
  const metadata = result.Metadata ?? {}
  return decryptSourceBuffer({
    algorithm: "aes-256-gcm",
    iv: metadata["relay-enc-iv"] ?? "",
    tag: metadata["relay-enc-tag"] ?? "",
    ciphertext: await streamToBuffer(result.Body),
  }, input.crypto)
}
