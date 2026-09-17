/**
 * Kiểm tra logic CSV export (không cần Mongo).
 * Chạy: node backend/scripts/test-ketqua-export-utils.js
 */
const assert = require("assert");
const {
  CSV_HEADERS,
  CSV_HEADERS_WITH_WRONG,
  getCsvHeaders,
  csvLine,
  baithiToCsvValues,
  parseExportParams,
  buildCreatedAtFilter,
  calcXeploai,
  partitionKeyFromDate,
  SYNC_EXPORT_ROW_LIMIT,
  buildCautraloisaiText,
} = require("../utils/ketquaExport");

assert.strictEqual(SYNC_EXPORT_ROW_LIMIT, 5000);
assert.ok(CSV_HEADERS.includes("hoten"));
assert.ok(CSV_HEADERS.includes("xeploai"));
assert.ok(!CSV_HEADERS.includes("cautraloisai"));
assert.ok(CSV_HEADERS_WITH_WRONG.includes("cautraloisai"));
assert.deepStrictEqual(getCsvHeaders(false), CSV_HEADERS);
assert.deepStrictEqual(getCsvHeaders(true), CSV_HEADERS_WITH_WRONG);

const one = parseExportParams({
  type: "ketqua-one",
  ids: "a",
});
assert.strictEqual(one.includeWrongAnswers, true);

const many = parseExportParams({
  type: "ketqua-many",
  ids: "a,b",
  includeWrongAnswers: true,
});
assert.strictEqual(many.includeWrongAnswers, false);

assert.strictEqual(
  buildCautraloisaiText([
    { choice: "a", question: { answer: "b", question: "Câu <b>một</b>" } },
    { choice: "b", question: { answer: "b", question: "Câu đúng" } },
  ]),
  "1. Câu một"
);

const params = parseExportParams({
  ids: "a,b, c",
  tungay: "2024-01-01",
  denngay: "2024-12-31",
  xeploai: "Giỏi",
});
assert.deepStrictEqual(params.ids, ["a", "b", "c"]);
assert.strictEqual(params.xeploai, "Giỏi");
assert.strictEqual(params.type, "ketqua-many");
assert.strictEqual(params.includeWrongAnswers, false);

const range = buildCreatedAtFilter("2024-01-01", "2024-01-31");
assert.ok(range.$gte instanceof Date);
assert.ok(range.$lt instanceof Date);

assert.strictEqual(calcXeploai(10, 10), "Xuất sắc");
assert.strictEqual(calcXeploai(4, 10), "Không đạt");
assert.strictEqual(partitionKeyFromDate(new Date("2025-06-15")), "2025");

const line = csvLine(["a", 'b"c', "d\ne"]);
assert.ok(line.includes('"b""c"'));

const valuesLight = baithiToCsvValues(
  {
    thongtinthisinh: {
      name: "Nguyen Van A",
      donvi: "donvi",
      phone: "090",
      birthday: "1990",
      gioitinh: "Nam",
      loaixe: "Xe con",
      hang_gplx: "B",
      nghenghiep: "",
      hokhau: "HY",
    },
    socaudung: 8,
    thoigianbatdau: Date.now() - 60000,
    thoigiannopbai: Date.now(),
  },
  { tencuocthi: "Cuoc 1", soluongcauhoi: 10, rank: 1 }
);
assert.strictEqual(valuesLight.length, CSV_HEADERS.length);

const values = baithiToCsvValues(
  {
    thongtinthisinh: {
      name: "Nguyen Van A",
      donvi: "donvi",
      phone: "090",
      birthday: "1990",
      gioitinh: "Nam",
      loaixe: "Xe con",
      hang_gplx: "B",
      nghenghiep: "",
      hokhau: "HY",
    },
    socaudung: 8,
    thoigianbatdau: Date.now() - 60000,
    thoigiannopbai: Date.now(),
    questions: [
      { choice: "a", question: { answer: "b", question: "Câu sai A" } },
    ],
  },
  {
    tencuocthi: "Cuoc 1",
    soluongcauhoi: 10,
    rank: 1,
    includeWrongAnswers: true,
  }
);
assert.strictEqual(values[0], 1);
assert.strictEqual(values[1], "Cuoc 1");
assert.strictEqual(values[2], "Nguyen Van A");
assert.strictEqual(values.length, CSV_HEADERS_WITH_WRONG.length);
assert.ok(String(values[values.length - 1]).includes("Câu sai A"));

console.log("test-ketqua-export-utils: OK");
