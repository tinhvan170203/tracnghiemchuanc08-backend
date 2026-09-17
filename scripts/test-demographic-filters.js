const assert = require("assert");
const {
  GENDERS,
  VEHICLE_TYPES,
  normalizeDemographicFilters,
  buildDemographicMongoFilter,
  hasDemographicFilters,
} = require("../utils/demographicFilters");

const empty = normalizeDemographicFilters({}, 2026);
assert.strictEqual(empty.hasAgeFilter, false);
assert.strictEqual(empty.gioitinh, "");

const range = normalizeDemographicFilters(
  {
    ageFrom: "18",
    ageTo: "35",
    gioitinh: "Nữ",
    loaixe: "Xe mô tô",
  },
  2026
);
assert.strictEqual(range.birthYearFrom, 1991);
assert.strictEqual(range.birthYearTo, 2008);
assert.strictEqual(range.gioitinh, "Nữ");
assert.strictEqual(range.loaixe, "Xe mô tô");

const onlyFrom = normalizeDemographicFilters({ ageFrom: "60" }, 2026);
assert.strictEqual(onlyFrom.birthYearFrom, 1906);
assert.strictEqual(onlyFrom.birthYearTo, 1966);

const onlyTo = normalizeDemographicFilters({ ageTo: "17" }, 2026);
assert.strictEqual(onlyTo.birthYearFrom, 2009);
assert.strictEqual(onlyTo.birthYearTo, 2026);

const mongo = buildDemographicMongoFilter(
  { ageFrom: "18", ageTo: "35", gioitinh: "Nam", loaixe: "Xe con" },
  2026
).filter;
assert.strictEqual(mongo["thongtinthisinh.gioitinh"], "Nam");
assert.strictEqual(mongo["thongtinthisinh.loaixe"], "Xe con");
assert.strictEqual(mongo["thongtinthisinh.birthday"].$gte, "1991");
assert.strictEqual(mongo["thongtinthisinh.birthday"].$lte, "2008");
assert.ok(mongo["thongtinthisinh.birthday"].$regex.test("2000"));
assert.ok(!mongo["thongtinthisinh.birthday"].$regex.test("không rõ"));

assert.strictEqual(hasDemographicFilters({ ageFrom: "" }), false);
assert.strictEqual(hasDemographicFilters({ gioitinh: "Nam" }), true);
assert.deepStrictEqual(GENDERS, ["Nam", "Nữ"]);
assert.ok(VEHICLE_TYPES.includes("Xe gắn máy"));
assert.ok(VEHICLE_TYPES.includes("Ô tô khách"));

assert.throws(
  () => normalizeDemographicFilters({ ageFrom: 40, ageTo: 20 }, 2026),
  /Tuổi từ/
);
assert.throws(
  () => normalizeDemographicFilters({ ageFrom: -1 }, 2026),
  /0 đến 120/
);
assert.throws(
  () => normalizeDemographicFilters({ gioitinh: "Khác" }, 2026),
  /Giới tính/
);
assert.throws(
  () => normalizeDemographicFilters({ loaixe: "Máy bay" }, 2026),
  /phương tiện/
);

console.log("demographic-filters: OK");
