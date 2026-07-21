#!/usr/bin/env node
/**
 * Sign launcher-update.json for production (Nexus compliance §4).
 *
 * Usage:
 *   # Generate keypair once (keep private key offline):
 *   node scripts/sign-launcher-update.mjs --generate-keys
 *
 *   # Sign after placing VisionsOfAetherius-update.zip and editing version:
 *   set VOA_UPDATE_SIGNING_KEY=<base64 private key>
 *   node scripts/sign-launcher-update.mjs --manifest path/to/launcher-update.json --artifact path/to/zip
 *
 * Public key goes in launcher (VOA_UPDATE_PUBLIC_KEY / embedded) and optionally API env.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

function canonicalSignPayload(info) {
  return [
    "voa-launcher-update-v1",
    info.version,
    info.downloadUrl,
    info.sha256.toLowerCase(),
    String(info.size ?? ""),
    info.format || "zip",
  ].join("\n");
}

function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const priv = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  console.log("VOA_UPDATE_PUBLIC_KEY=" + pub);
  console.log("VOA_UPDATE_SIGNING_KEY=" + priv);
  console.log("\nStore the private key offline. Embed the public key in the launcher.");
}

function sign(manifestPath, artifactPath) {
  const privB64 = (process.env.VOA_UPDATE_SIGNING_KEY || "").trim();
  if (!privB64) {
    console.error("Set VOA_UPDATE_SIGNING_KEY to the base64 PKCS8 Ed25519 private key");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!fs.existsSync(artifactPath)) {
    console.error("Artifact not found:", artifactPath);
    process.exit(1);
  }
  const buf = fs.readFileSync(artifactPath);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  const size = buf.length;
  const version = String(raw.version || "").trim();
  const downloadUrl = String(raw.downloadUrl || "").trim();
  const format = raw.format || (artifactPath.endsWith(".zip") ? "zip" : "portable");
  if (!version || !downloadUrl) {
    console.error("Manifest must include version and downloadUrl");
    process.exit(1);
  }
  if (!downloadUrl.startsWith("https://") && !downloadUrl.includes("127.0.0.1")) {
    console.error("downloadUrl must be HTTPS for production");
    process.exit(1);
  }
  const payload = canonicalSignPayload({
    version,
    downloadUrl,
    sha256,
    size,
    format,
  });
  const key = crypto.createPrivateKey({
    key: Buffer.from(privB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signature = crypto.sign(null, Buffer.from(payload, "utf8"), key).toString("base64");
  const out = {
    ...raw,
    version,
    downloadUrl,
    sha256,
    size,
    format,
    signature,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Signed", manifestPath);
  console.log("  version=", version);
  console.log("  sha256=", sha256);
  console.log("  size=", size);
  console.log("  signature=", signature.slice(0, 24) + "…");
}

const args = process.argv.slice(2);
if (args.includes("--generate-keys")) {
  generateKeys();
} else {
  let manifest = path.join(process.cwd(), "launcher-update.json");
  let artifact = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manifest") manifest = args[++i];
    if (args[i] === "--artifact") artifact = args[++i];
  }
  if (!artifact) {
    console.error("Usage: node scripts/sign-launcher-update.mjs --manifest M --artifact A");
    process.exit(1);
  }
  sign(manifest, artifact);
}
