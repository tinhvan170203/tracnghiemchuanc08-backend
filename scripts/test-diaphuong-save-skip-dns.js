const assert = require("assert");
const {
  assertSafeFetchUrl,
} = require("../utils/safeFetchUrl");
const {
  resolveDiaphuongApiBase,
  resolveDiaphuongApiBaseForSave,
  normalizeDiaphuongApiBase,
} = require("../utils/diaphuongApiUrl");

async function expectReject(fn, includes) {
  let threw = false;
  try {
    await fn();
  } catch (error) {
    threw = true;
    if (includes) {
      assert.match(String(error.message), includes);
    }
  }
  assert.ok(threw, "expected rejection");
}

async function main() {
  const saved = await resolveDiaphuongApiBaseForSave(
    "https://antoangiaothongc08.com"
  );
  assert.strictEqual(saved, "https://antoangiaothongc08.com/api");

  const fanout = await resolveDiaphuongApiBase(
    "https://antoangiaothongc08.com/api"
  );
  assert.strictEqual(fanout, "https://antoangiaothongc08.com/api");

  assert.strictEqual(
    normalizeDiaphuongApiBase(
      "https://antoangiaothongc08.com/api/public/sumary/toan-quoc"
    ),
    "https://antoangiaothongc08.com/api"
  );

  await expectReject(
    () => resolveDiaphuongApiBaseForSave("http://localhost/api"),
    /không được phép/i
  );
  await expectReject(
    () => resolveDiaphuongApiBaseForSave("http://127.0.0.1/api"),
    /IP nội bộ/i
  );
  await expectReject(
    () => resolveDiaphuongApiBaseForSave("http://192.168.1.10/api"),
    /IP nội bộ/i
  );
  await expectReject(
    () => resolveDiaphuongApiBaseForSave("not-a-url"),
    /định dạng URL/i
  );

  const skipped = await assertSafeFetchUrl(
    "https://antoangiaothongc08.com/api",
    { skipDnsLookup: true }
  );
  assert.strictEqual(skipped, "https://antoangiaothongc08.com/api");

  // Fan-out cũng không còn fail vì DNS pre-check
  const unresolved = await resolveDiaphuongApiBase(
    "https://domain-khong-ton-tai-xyz-12345.invalid/api"
  );
  assert.strictEqual(
    unresolved,
    "https://domain-khong-ton-tai-xyz-12345.invalid/api"
  );

  console.log("diaphuong-save-skip-dns: OK");
}

main().catch((error) => {
  console.error("diaphuong-save-skip-dns: FAIL", error);
  process.exitCode = 1;
});
