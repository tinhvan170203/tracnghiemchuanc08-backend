const crypto = require("crypto");

const IV_LENGTH = 16;

function encryptData(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", process.env.SECRET_KEY, iv);
  let encrypted = cipher.update(String(text));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptData(encryptedText) {
  if (encryptedText == null || encryptedText === "") return "";
  const raw = String(encryptedText);
  if (!raw.includes(":")) return raw;
  try {
    const textParts = raw.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedData = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      process.env.SECRET_KEY,
      iv
    );
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.warn("decryptData:", err.message);
    return raw;
  }
}

function decryptThisinh(tt = {}) {
  return {
    ...tt,
    name: decryptData(tt.name),
    donvi: decryptData(tt.donvi),
    phone: decryptData(tt.phone),
  };
}

module.exports = {
  encryptData,
  decryptData,
  decryptThisinh,
};
