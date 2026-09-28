/**
 * Smoke so sánh 2 kỳ — cùng template.
 * Chạy: node backend/scripts/test-baocao-compare.js
 */
const assert = require("assert");
const {
  assertSameTemplate,
  buildValuesByUser,
  buildCompareRows,
  numberFieldKeysFromSnapshot,
} = require("../utils/baoCaoCompare");

const tpl = "tttttttttttttttttttttttt";
const periodA = {
  templateId: tpl,
  assignees: [
    { userId: "u1", tenDonVi: "Đơn vị 1" },
    { userId: "u2", tenDonVi: "Đơn vị 2" },
  ],
};
const periodB = {
  templateId: tpl,
  assignees: [
    { userId: "u1", tenDonVi: "Đơn vị 1" },
    { userId: "u3", tenDonVi: "Đơn vị 3" },
  ],
};
const periodOther = { templateId: "oooooooooooooooooooooooo", assignees: [] };

assert.strictEqual(assertSameTemplate(periodA, periodB), tpl);
let threw = false;
try {
  assertSameTemplate(periodA, periodOther);
} catch (e) {
  threw = e.status === 400;
}
assert.strictEqual(threw, true, "khác template phải 400");

const mapA = buildValuesByUser(periodA, [
  { userId: "u1", values: { so: 10 }, status: "submitted", tenDonVi: "Đơn vị 1" },
  { userId: "u2", values: { so: 5 }, status: "draft", tenDonVi: "Đơn vị 2" },
]);
const mapB = buildValuesByUser(periodB, [
  { userId: "u1", values: { so: 15 }, status: "submitted", tenDonVi: "Đơn vị 1" },
  { userId: "u3", values: { so: 7 }, status: "submitted", tenDonVi: "Đơn vị 3" },
]);

const rows = buildCompareRows(mapA, mapB, ["so"]);
assert.strictEqual(rows.length, 3, "union 3 đơn vị");

const u1 = rows.find((r) => r.userId === "u1");
assert.strictEqual(u1.deltas.so, 5, "delta B-A = 5");
assert.strictEqual(u1.inA && u1.inB, true);

const u2 = rows.find((r) => r.userId === "u2");
assert.strictEqual(u2.inA, true);
assert.strictEqual(u2.inB, false);
assert.strictEqual(u2.deltas.so, null, "thiếu 1 bên → delta null");

const keys = numberFieldKeysFromSnapshot({
  sections: [
    {
      fields: [
        { key: "so", dataType: "number" },
        { key: "ten", dataType: "text" },
      ],
    },
  ],
});
assert.deepStrictEqual(keys, ["so"]);

console.log("All baoCaoCompare smoke tests passed");
