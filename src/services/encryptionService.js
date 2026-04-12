"use strict";

const crypto = require("crypto");
const ALG = "aes-256-gcm";

function getKey() {
  if (process.env.NODE_ENV === "test") return Buffer.alloc(32); // zero key for tests
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length < 32) throw new Error("ENCRYPTION_KEY env var must be at least 32 characters.");
  return Buffer.from(k.slice(0, 32));
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

function decrypt(data) {
  const [ivHex, tagHex, encHex] = data.split(":");
  const decipher = crypto.createDecipheriv(ALG, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
}

module.exports = { encrypt, decrypt };
