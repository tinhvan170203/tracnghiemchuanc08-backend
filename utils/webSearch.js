const https = require("https");
const { getOpenAI, getChatModel } = require("./openaiClient");

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
    req.setTimeout(15000, () => {
      req.destroy(new Error("Web search timeout"));
    });
  });
}

async function searchBing(query) {
  const key = process.env.BING_SEARCH_KEY;
  if (!key) return null;

  const url =
    "https://api.bing.microsoft.com/v7.0/search?count=5&mkt=vi-VN&q=" +
    encodeURIComponent(query);

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
 * Prefer Bing if configured; otherwise try OpenAI Responses web_search tool.
 */
async function webSearch(query) {
  try {
    const bing = await searchBing(query);
    if (bing && bing.length) {
      return { provider: "bing", results: bing };
    }
  } catch (err) {
    console.error("Bing search error:", err.message);
  }

  try {
    const openai = getOpenAI();
    const response = await openai.responses.create({
      model: getChatModel(),
      tools: [{ type: "web_search_preview" }],
      input: `Tìm thông tin mới nhất về: ${query}`,
    });

    const text =
      response.output_text ||
      (Array.isArray(response.output)
        ? response.output
            .map((o) =>
              (o.content || [])
                .map((c) => c.text || c.output_text || "")
                .join("\n")
            )
            .join("\n")
        : "");

    if (text && String(text).trim()) {
      return {
        provider: "openai_web",
        results: [
          {
            title: "Kết quả tìm kiếm web (OpenAI)",
            url: "",
            snippet: String(text).slice(0, 4000),
          },
        ],
      };
    }
  } catch (err) {
    console.error("OpenAI web search error:", err.message);
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
};
