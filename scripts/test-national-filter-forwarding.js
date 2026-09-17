const assert = require("assert");

const Diaphuongs = require("../models/Diaphuongs");
const fanpage = require("../controllers/fanpage");
const urlUtils = require("../utils/diaphuongApiUrl");

const originalFind = Diaphuongs.find;
const originalFetch = fanpage.fetchRemoteJson;
const originalResolve = urlUtils.resolveDiaphuongApiBaseForSave;

let capturedUrl = null;
let remotePayload = null;

Diaphuongs.find = () => ({
  lean: async () => [
    {
      _id: "68b1a8c76087e71c51253c28",
      text: "Domain test",
      domain: "https://example.com",
    },
  ],
});
fanpage.fetchRemoteJson = async (url) => {
  capturedUrl = url;
  return remotePayload;
};
urlUtils.resolveDiaphuongApiBaseForSave = async () => "https://example.com/api";

delete require.cache[require.resolve("../c08/c08")];
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

async function invoke(query) {
  const res = mockResponse();
  await c08.sumaryKetquas({ query }, res);
  return res.result;
}

async function main() {
  remotePayload = {
    filterVersion: 1,
    total: 2,
    total_nopbai: 2,
  };
  const query = {
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
    list: ["68b1a8c76087e71c51253c28"],
    ageFrom: "18",
    ageTo: "35",
    gioitinh: "Nữ",
    loaixe: "Xe mô tô",
  };
  const supported = await invoke(query);
  assert.strictEqual(supported.statusCode, 200);
  assert.strictEqual(supported.body.listSuccess.length, 1);
  assert.strictEqual(supported.body.listError.length, 0);
  assert.ok(capturedUrl instanceof URL);
  assert.strictEqual(capturedUrl.searchParams.get("ageFrom"), "18");
  assert.strictEqual(capturedUrl.searchParams.get("ageTo"), "35");
  assert.strictEqual(capturedUrl.searchParams.get("gioitinh"), "Nữ");
  assert.strictEqual(capturedUrl.searchParams.get("loaixe"), "Xe mô tô");

  remotePayload = { total: 999, total_nopbai: 999 };
  const oldDomain = await invoke(query);
  assert.strictEqual(oldDomain.statusCode, 200);
  assert.strictEqual(oldDomain.body.listSuccess.length, 0);
  assert.strictEqual(oldDomain.body.listError.length, 1);
  assert.match(oldDomain.body.listError[0].error, /chưa hỗ trợ bộ lọc/);

  remotePayload = { total: 5 };
  const noDemographic = await invoke({
    fromDate: "2026-01-01",
    toDate: "2026-12-31",
    list: ["68b1a8c76087e71c51253c28"],
  });
  assert.strictEqual(noDemographic.body.listSuccess.length, 1);

  console.log("national-filter-forwarding: OK");
}

main()
  .catch((error) => {
    console.error("national-filter-forwarding: FAIL", error);
    process.exitCode = 1;
  })
  .finally(() => {
    Diaphuongs.find = originalFind;
    fanpage.fetchRemoteJson = originalFetch;
    urlUtils.resolveDiaphuongApiBaseForSave = originalResolve;
  });
