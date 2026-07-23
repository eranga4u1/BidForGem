import { hash, verify, type Algorithm } from "@node-rs/argon2";
import type { Argon2Params } from "./config.js";

// @node-rs/argon2's Algorithm is an ambient const enum (can't be referenced as a
// value under verbatimModuleSyntax). Argon2id === 2; assert the literal to keep
// the choice explicit and type-checked.
const ARGON2ID = 2 as Algorithm;

function toOptions(params: Argon2Params): {
  algorithm: Algorithm;
  memoryCost: number;
  timeCost: number;
  parallelism: number;
} {
  return {
    algorithm: ARGON2ID,
    memoryCost: params.memoryCost,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  };
}

/** Hash a plaintext password with argon2id. The plaintext is never persisted. */
export function hashPassword(params: Argon2Params, plain: string): Promise<string> {
  return hash(plain, toOptions(params));
}

/** Verify a plaintext password against an argon2 hash. Returns false on any error. */
export async function verifyPassword(hashString: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashString, plain);
  } catch {
    return false;
  }
}

// Memoized dummy hashes (keyed by argon2 params) so the "email not found" login
// path performs the same argon2 work as a real verify — no timing oracle for
// account existence.
const dummyHashCache = new Map<string, Promise<string>>();

export function getDummyHash(params: Argon2Params): Promise<string> {
  const key = `${params.memoryCost}:${params.timeCost}:${params.parallelism}`;
  let cached = dummyHashCache.get(key);
  if (!cached) {
    cached = hashPassword(params, "dummy-password-for-timing-equalization");
    dummyHashCache.set(key, cached);
  }
  return cached;
}
