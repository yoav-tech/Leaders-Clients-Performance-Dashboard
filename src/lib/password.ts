// Password hashing with scrypt (Node crypto). Node-only — never import from edge/middleware.
// Format: "scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>". Verify is constant-time.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string | Buffer, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

const N = 16384, r = 8, p = 1, KEYLEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, nStr, rStr, pStr, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const got = await scrypt(password, salt, expected.length, { N: Number(nStr), r: Number(rStr), p: Number(pStr) });
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}
