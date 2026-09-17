const { URL } = require("url");
const { assertSafeFetchUrl } = require("./safeFetchUrl");

/**
 * Chuẩn hóa domain địa phương về base kết thúc bằng /api
 * (chấp nhận URL cũ .../api/public/sumary/toan-quoc).
 * @returns {string} href base, vd https://host/api hoặc https://host/c08/api
 */
function normalizeDiaphuongApiBase(rawHref) {
  const url = new URL(String(rawHref).trim());
  let path = (url.pathname || "/").replace(/\/+$/, "") || "";

  const publicIdx = path.toLowerCase().indexOf("/api/public");
  if (publicIdx >= 0) {
    path = path.slice(0, publicIdx + 4); // giữ .../api
  } else if (/\/api$/i.test(path)) {
    // đã đúng
  } else if (!path || path === "/") {
    path = "/api";
  } else {
    path = `${path}/api`;
  }

  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

/**
 * Validate URL + chuẩn hóa về .../api.
 * Mặc định skip DNS: luồng địa phương (lưu + fan-out) không pre-check dns.lookup;
 * kết nối thật do fetch quyết định. Vẫn chặn localhost / IP literal nội bộ.
 * @param {string} rawUrl
 * @param {{ skipDnsLookup?: boolean }} [options]
 */
async function resolveDiaphuongApiBase(rawUrl, options = {}) {
  const safe = await assertSafeFetchUrl(rawUrl, {
    skipDnsLookup: true,
    ...options,
  });
  return normalizeDiaphuongApiBase(safe);
}

/** Alias rõ nghĩa cho lưu/sửa/fan-out địa phương — không dns.lookup */
async function resolveDiaphuongApiBaseForSave(rawUrl) {
  return resolveDiaphuongApiBase(rawUrl, { skipDnsLookup: true });
}

/**
 * Nối path public vào base /api
 * @param {string} apiBaseHref vd https://host/api
 * @param {string} relativePath vd /public/sumary/toan-quoc
 */
function buildDiaphuongPublicUrl(apiBaseHref, relativePath, query = {}) {
  const base = new URL(apiBaseHref);
  const rel = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  base.pathname = `${base.pathname.replace(/\/+$/, "")}${rel}`;
  base.search = "";
  base.hash = "";
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== "") {
      base.searchParams.set(k, String(v));
    }
  }
  return base;
}

module.exports = {
  normalizeDiaphuongApiBase,
  resolveDiaphuongApiBase,
  resolveDiaphuongApiBaseForSave,
  buildDiaphuongPublicUrl,
};
