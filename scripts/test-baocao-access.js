/**
 * Smoke ACL baoCaoAccess (CommonJS).
 * Chạy: node backend/scripts/test-baocao-access.js
 */
const assert = require("assert");
const {
  isBaoCaoSuperAdmin,
  buildBaoCaoOwnerFilter,
  canAccessBaoCaoOwned,
  canReadPeriod,
  assertCanManagePeriod,
} = require("../utils/baoCaoAccess");

const userA = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  roles: ["cấu hình biểu mẫu báo cáo", "thêm báo cáo"],
};
const userB = {
  _id: "bbbbbbbbbbbbbbbbbbbbbbbb",
  roles: ["cấu hình biểu mẫu báo cáo"],
};
const superU = {
  _id: "cccccccccccccccccccccccc",
  roles: ["quản trị tất cả báo cáo"],
};

assert.strictEqual(isBaoCaoSuperAdmin(superU), true);
assert.strictEqual(isBaoCaoSuperAdmin(userA), false);

const filterA = buildBaoCaoOwnerFilter(userA);
assert.strictEqual(String(filterA.createdBy), String(userA._id));
assert.deepStrictEqual(buildBaoCaoOwnerFilter(superU), {});

const docA = { _id: "1", createdBy: userA._id };
const docB = { _id: "2", createdBy: userB._id };
const docNull = { _id: "3", createdBy: null };

assert.strictEqual(canAccessBaoCaoOwned(userA, docA), true);
assert.strictEqual(canAccessBaoCaoOwned(userA, docB), false);
assert.strictEqual(canAccessBaoCaoOwned(userA, docNull), false);
assert.strictEqual(canAccessBaoCaoOwned(superU, docB), true);
assert.strictEqual(canAccessBaoCaoOwned(superU, docNull), true);

const periodAssigned = {
  createdBy: userA._id,
  assignees: [{ userId: userB._id }],
};
assert.strictEqual(canReadPeriod(userB, periodAssigned), true);
assert.strictEqual(canAccessBaoCaoOwned(userB, periodAssigned), false);

let threw = false;
try {
  assertCanManagePeriod(userB, periodAssigned);
} catch (e) {
  threw = e.status === 403;
}
assert.strictEqual(threw, true, "non-owner manage must 403");

assertCanManagePeriod(userA, periodAssigned);
assertCanManagePeriod(superU, periodAssigned);

console.log("All baoCaoAccess smoke tests passed");
