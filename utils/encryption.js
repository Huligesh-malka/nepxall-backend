const crypto = require("crypto");

const algorithm = "aes-256-cbc";
const key = crypto.createHash("sha256").update("my_secret_key").digest();
const iv = Buffer.alloc(16, 0);

// 🔐 ENCRYPT
function encrypt(text) {
  if (!text) return null;
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text.toString(), "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

// 🔓 DECRYPT
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encrypt, decrypt };