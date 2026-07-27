const net = require("net");
const dns = require("dns").promises;
const { URL } = require("url");

function isPrivateOrLocalIp(ip) {
  if (!ip) return true;

  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }

  if (net.isIP(ip) === 6) {
    const n = ip.toLowerCase();
    if (n === "::1") return true;
    if (n.startsWith("fc") || n.startsWith("fd") || n.startsWith("fe80")) return true;
    if (n.startsWith("::ffff:")) {
      return isPrivateOrLocalIp(n.replace("::ffff:", ""));
    }
  }

  return false;
}

/**
 * Chặn SSRF: chỉ http/https, không localhost/IP nội bộ/metadata.
 * @returns {string} URL đã chuẩn hóa (href)
 */
async function assertSafeFetchUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Domain không hợp lệ");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Domain không đúng định dạng URL (vd: https://example.com/api)");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Chỉ cho phép domain http hoặc https");
  }

  const host = parsed.hostname.toLowerCase();
  const blockedHosts = new Set([
    "localhost",
    "metadata.google.internal",
    "metadata",
  ]);
  if (blockedHosts.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Domain không được phép");
  }

  if (net.isIP(host)) {
    if (isPrivateOrLocalIp(host)) {
      throw new Error("Không cho phép IP nội bộ / local");
    }
  } else {
    const { address } = await dns.lookup(host);
    if (isPrivateOrLocalIp(address)) {
      throw new Error("Domain resolve về địa chỉ nội bộ — bị chặn");
    }
  }

  return parsed.href;
}

module.exports = {
  assertSafeFetchUrl,
  isPrivateOrLocalIp,
};
