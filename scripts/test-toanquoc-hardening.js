const assert = require("assert");
const {
  normalizeThongkeDateRange,
  parseLocalDay,
} = require("../utils/localDay");
const {
  formatFetchNetworkError,
  fetchRemoteJson,
} = require("../controllers/fanpage");
const common = require("../controllers/common");
const c08 = require("../c08/c08");

function mockResponse() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
}

async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res.result;
}

async function testLocalDay() {
  const missing = normalizeThongkeDateRange("", "");
  assert.strictEqual(missing.fromDate, "1990-01-01");
  assert.strictEqual(missing.toDate, "3000-01-01");
  assert.strictEqual(missing.toDateExclusive, "3000-01-02");

  const range = normalizeThongkeDateRange("2026-01-01", "2026-01-31");
  assert.strictEqual(range.fromDate, "2026-01-01");
  assert.strictEqual(range.toDate, "2026-01-31");
  assert.strictEqual(range.toDateExclusive, "2026-02-01");

  assert.strictEqual(parseLocalDay("2026-02-30"), null);

  let threw = false;
  try {
    normalizeThongkeDateRange("2026-01-01", "bad");
  } catch (error) {
    threw = true;
    assert.strictEqual(error.status, 400);
  }
  assert.ok(threw);

  threw = false;
  try {
    normalizeThongkeDateRange("2026-12-01", "2026-01-01");
  } catch (error) {
    threw = true;
    assert.strictEqual(error.status, 400);
  }
  assert.ok(threw);
}

async function testFetchMessages() {
  const msg = formatFetchNetworkError(
    { message: "fetch failed", cause: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND x.com" } },
    "https://antoangiaothongc08.com/api/public/sumary/toan-quoc"
  );
  assert.match(msg, /DNS không phân giải được/);
  assert.match(msg, /antoangiaothongc08\.com/);

  const timeout = formatFetchNetworkError(
    { name: "TimeoutError", message: "The operation was aborted due to timeout" },
    "https://example.com/api"
  );
  assert.match(timeout, /Hết thời gian chờ/);

  // HTTP body message is surfaced
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 501,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ message: "Lỗi domain" }),
  });
  try {
    await fetchRemoteJson("https://example.com/api/public/sumary/toan-quoc");
    assert.fail("expected throw");
  } catch (error) {
    assert.match(error.message, /HTTP 501: Lỗi domain/);
  } finally {
    global.fetch = originalFetch;
  }
}

async function testPublicThongkeMissingDates() {
  // Stub heavy DB access by temporarily replacing methods via lean query chain
  const Cuocthis = require("../models/Cuocthi");
  const LichsuThis = require("../models/LichsuThi");
  const originalC = Cuocthis.find;
  const originalL = LichsuThis.find;

  const emptyQuery = {
    select() {
      return this;
    },
    lean: async () => [],
  };
  Cuocthis.find = () => emptyQuery;
  LichsuThis.find = () => emptyQuery;

  try {
    const result = await invoke(common.publicThongke, { query: {} });
    assert.strictEqual(result.statusCode, 200, JSON.stringify(result.body));
    assert.strictEqual(result.body.filterVersion, 1);
    assert.ok(!String(result.body.message || "").includes("Invalid time"));

    const bad = await invoke(common.publicThongke, {
      query: { fromDate: "2026-01-01", toDate: "31-01-2026" },
    });
    assert.strictEqual(bad.statusCode, 400);
    assert.match(bad.body.message, /yyyy-mm-dd/i);
    assert.notStrictEqual(bad.body.message, "Lỗi domain");
  } finally {
    Cuocthis.find = originalC;
    LichsuThis.find = originalL;
  }
}

async function testHubRequiresDates() {
  const result = await invoke(c08.sumaryKetquas, { query: { list: [] } });
  assert.strictEqual(result.statusCode, 400);
  assert.match(result.body.message, /Thiếu fromDate hoặc toDate/);
}

async function main() {
  await testLocalDay();
  await testFetchMessages();
  await testPublicThongkeMissingDates();
  await testHubRequiresDates();
  console.log("toanquoc-hardening: OK");
}

main().catch((error) => {
  console.error("toanquoc-hardening: FAIL", error);
  process.exitCode = 1;
});
