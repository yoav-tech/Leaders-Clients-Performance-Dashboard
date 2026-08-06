// Create / update a dashboard user (per-client access). Run:
//   npm run add-user -- --email client@example.com --brands la-beaute,argania,studio-pasha
//   npm run add-user -- --email team@ldrsgroup.com --role admin
// If --password is omitted a strong one is generated and printed once.
import { randomBytes } from "node:crypto";
import { hashPassword } from "../src/lib/password";
import { upsertUser } from "../src/lib/users";
import { getBrand } from "../src/lib/brands";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function genPassword(): string {
  return randomBytes(12).toString("base64").replace(/[+/=]/g, "").slice(0, 14);
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const role = (arg("role") ?? "client") as "admin" | "client";
  const brands = (arg("brands") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (!email || (role === "client" && brands.length === 0)) {
    console.error("Usage: npm run add-user -- --email x@y.com --brands slug1,slug2 [--role client|admin] [--password ...]");
    process.exit(1);
  }
  const bad = brands.filter((b) => !getBrand(b));
  if (bad.length) {
    console.error(`Unknown brand slug(s): ${bad.join(", ")}`);
    process.exit(1);
  }

  const password = arg("password") ?? genPassword();
  await upsertUser({ email, passwordHash: await hashPassword(password), role, brandIds: brands });
  console.log(`✓ ${email}  role=${role}  brands=[${brands.join(", ")}]`);
  console.log(`  password: ${password}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
