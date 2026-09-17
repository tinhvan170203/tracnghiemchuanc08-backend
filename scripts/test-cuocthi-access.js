/**
 * Unit tests for cuocthiAccess helpers (no Mongo).
 * Run: node backend/scripts/test-cuocthi-access.js
 */
const assert = require("assert");
const mongoose = require("mongoose");
const {
  CONTEST_SUPER_ADMIN_ROLE,
  isContestSuperAdmin,
  isMonthiAllowed,
  buildCuocthiAccessFilter,
  canAccessCuocthi,
  parseCreatorIds,
} = require("../utils/cuocthiAccess");

const monthiA = new mongoose.Types.ObjectId();
const monthiB = new mongoose.Types.ObjectId();
const userAId = new mongoose.Types.ObjectId();
const userBId = new mongoose.Types.ObjectId();

const userA = {
  _id: userAId,
  roles: ["xem cuộc thi"],
  quantrinhomdonvi: [monthiA],
};

const userAdmin = {
  _id: new mongoose.Types.ObjectId(),
  roles: ["xem cuộc thi", CONTEST_SUPER_ADMIN_ROLE],
  quantrinhomdonvi: [],
};

assert.strictEqual(isContestSuperAdmin(userA), false);
assert.strictEqual(isContestSuperAdmin(userAdmin), true);
assert.strictEqual(isMonthiAllowed(userA, monthiA), true);
assert.strictEqual(isMonthiAllowed(userA, monthiB), false);

const ownFilter = buildCuocthiAccessFilter(userA, { monthiId: monthiA });
assert.strictEqual(String(ownFilter.createdBy), String(userAId));
assert.strictEqual(String(ownFilter.monthi), String(monthiA));
assert.deepStrictEqual(ownFilter.thongtinthisinh, { $exists: false });

const denyMonthi = buildCuocthiAccessFilter(userA, { monthiId: monthiB });
assert.deepStrictEqual(denyMonthi._id, { $in: [] });

const adminAll = buildCuocthiAccessFilter(userAdmin, {});
assert.strictEqual(adminAll.createdBy, undefined);
assert.strictEqual(adminAll.monthi, undefined);
assert.deepStrictEqual(adminAll.thongtinthisinh, { $exists: false });

const creators = parseCreatorIds(`${userAId},${userBId}`);
assert.strictEqual(creators.length, 2);
const adminCreators = buildCuocthiAccessFilter(userAdmin, {
  creatorIds: creators,
  monthiId: monthiA,
});
assert.ok(adminCreators.createdBy.$in);
assert.strictEqual(String(adminCreators.monthi), String(monthiA));

assert.strictEqual(
  canAccessCuocthi(userA, {
    createdBy: userAId,
    monthi: monthiA,
  }),
  true
);
assert.strictEqual(
  canAccessCuocthi(userA, {
    createdBy: userBId,
    monthi: monthiA,
  }),
  false
);
assert.strictEqual(
  canAccessCuocthi(userA, {
    createdBy: null,
    monthi: monthiA,
  }),
  false
);
assert.strictEqual(
  canAccessCuocthi(userAdmin, {
    createdBy: null,
    monthi: monthiB,
  }),
  true
);

console.log("test-cuocthi-access: OK");
