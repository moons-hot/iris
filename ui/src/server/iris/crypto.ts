import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { FragmentCipher, FragmentType } from "@/server/iris/types";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * Hackathon key handling: one symmetric key from the environment.
 *
 * A real deployment would hold this in a KMS/HSM outside the database, so that
 * possession of a Tiger backup is not possession of the plaintext. We keep the
 * key out of the DB here too, but it lives in process env rather than a KMS.
 */
function masterKey(): Buffer {
  const raw = process.env.IRIS_MASTER_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error("IRIS_MASTER_KEY must be 32 bytes encoded as base64");
    }
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("IRIS_MASTER_KEY is required outside development");
  }
  // Deterministic development key so the in-memory demo works with no setup.
  return createHash("sha256").update("iris-development-key").digest();
}

/**
 * Additional authenticated data binds ciphertext to its patient and field, so a
 * fragment cannot be moved between patients or relabelled without detection.
 */
function aad(patientId: string, fragmentType: FragmentType): Buffer {
  return Buffer.from(`${patientId}|${fragmentType}`, "utf8");
}

export interface EncryptedValue {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function encryptFragmentValue(
  patientId: string,
  fragmentType: FragmentType,
  plaintext: string,
): EncryptedValue {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);
  cipher.setAAD(aad(patientId, fragmentType));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/**
 * Only ever called with fragments the policy engine returned in its allow set.
 * `assertAuthorized` makes that a runtime invariant rather than a convention.
 */
export function decryptFragment(
  fragment: FragmentCipher,
  authorizedIds: ReadonlySet<string>,
): string {
  assertAuthorized(fragment.id, authorizedIds);
  const decipher = createDecipheriv(ALGORITHM, masterKey(), fragment.iv);
  decipher.setAAD(aad(fragment.patientId, fragment.fragmentType));
  decipher.setAuthTag(fragment.authTag);
  return Buffer.concat([
    decipher.update(fragment.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

function assertAuthorized(
  fragmentId: string,
  authorizedIds: ReadonlySet<string>,
): void {
  if (!authorizedIds.has(fragmentId)) {
    throw new Error(
      `Refusing to decrypt fragment ${fragmentId}: not in the current policy decision`,
    );
  }
}

export function hashChain(
  previousHash: string | null,
  canonical: string,
): string {
  return createHash("sha256")
    .update(`${previousHash ?? ""}|${canonical}`)
    .digest("hex");
}

export function deviceResponse(secretHex: string, nonce: string): string {
  return createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(nonce, "utf8")
    .digest("hex");
}

export function verifyDeviceResponse(
  secretHex: string,
  nonce: string,
  response: string,
): boolean {
  const expected = Buffer.from(deviceResponse(secretHex, nonce), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(response, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}
