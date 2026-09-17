const https = require("https");

const WEB_SEARCH_TIMEOUT_MS = Number(process.env.AI_WEB_SEARCH_TIMEOUT_MS || 12000);

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label || "operation"} timeout after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

function httpsGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw || "{}") });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(Math.min(WEB_SEARCH_TIMEOUT_MS, 15000), () => {
      req.destroy(new Error("Web search timeout"));
    });
  });
}

/** Bổ sung ngữ cảnh pháp lý VN cho Bing (nếu bật). */
function enrichAtgtQuery(query) {
  const q = String(query || "").trim();
  if (!q) return q;
  if (q.length > 420) return q.slice(0, 500);
  const lower = q.toLowerCase();
  const extras = [];
  if (!/ngh[ịi]\s*đ[ịi]nh|lu[ậa]t\s|th[ôo]ng\s*t[ưu]|x[ửu]\s*ph[ạa]t/.test(lower)) {
    extras.push("Nghị định xử phạt giao thông Việt Nam");
  }
  if (!/vi[ệe]t\s*nam|vn/.test(lower)) {
    extras.push("Việt Nam");
  }
  if (!extras.length) return q;
  return `${q} ${extras.join(" ")}`.slice(0, 500);
}

async function searchBing(query) {
  const key = process.env.BING_SEARCH_KEY;
  if (!key) return null;

  const q = enrichAtgtQuery(query);
  const url =
    "https://api.bing.microsoft.com/v7.0/search?count=5&mkt=vi-VN&q=" +
    encodeURIComponent(q);

  const { status, data } = await httpsGetJson(url, {
    "Ocp-Apim-Subscription-Key": key,
  });

  if (status !== 200) return null;

  const pages = data?.webPages?.value || [];
  return pages.map((p) => ({
    title: p.name,
    url: p.url,
    snippet: p.snippet,
  }));
}

/**
 * Chỉ Bing (nếu có key). Đã bỏ OpenAI web_search tool (phí cao).
 * Bật web bằng AI_WEB_SEARCH_ENABLED=true + BING_SEARCH_KEY.
 */
async function webSearch(query) {
  try {
    const bing = await withTimeout(
      searchBing(query),
      WEB_SEARCH_TIMEOUT_MS,
      "Bing search"
    );
    if (bing && bing.length) {
      return { provider: "bing", results: bing };
    }
  } catch (err) {
    console.error("Bing search error:", err.message);
  }

  return { provider: "none", results: [] };
}

function formatWebResults(results) {
  if (!results?.length) return "Không có kết quả tìm kiếm web.";
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title || "Nguồn"}\n${r.snippet || ""}\n${r.url || ""}`
    )
    .join("\n\n");
}

module.exports = {
  webSearch,
  formatWebResults,
  enrichAtgtQuery,
};
