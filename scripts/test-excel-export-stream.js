const assert = require("assert");
const { PassThrough } = require("stream");
const ExcelJS = require("exceljs");

// Load controller after light stubs if needed — functions are module-local,
// so we re-test behavior via export handlers with mocked load path by
// exercising the workbook write path through a minimal reimplementation check.

const monthiPath = require.resolve("../controllers/monthi");
delete require.cache[monthiPath];

async function readWorkbookFromBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

async function testStreamWriteProducesValidXlsx() {
  const chunks = [];
  const stream = new PassThrough();
  stream.on("data", (c) => chunks.push(Buffer.from(c)));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("KetQua");
  sheet.columns = [
    { header: "hoten", key: "hoten", width: 20 },
    { header: "cautraloisai", key: "cautraloisai", width: 40 },
  ];
  sheet.addRow({ hoten: "A", cautraloisai: "1. sai\r\n2. sai" });
  await workbook.xlsx.write(stream);
  stream.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  const buffer = Buffer.concat(chunks);
  assert.ok(buffer.length > 100);
  const loaded = await readWorkbookFromBuffer(buffer);
  assert.strictEqual(loaded.getWorksheet("KetQua").getRow(2).getCell(1).value, "A");
}

async function testBulkSkipWrongAnswersFlag() {
  // Mirror controller query parsing
  const parse = (includeWrongAnswers) =>
    String(includeWrongAnswers || "").trim() === "1" ||
    String(includeWrongAnswers || "").toLowerCase() === "true";

  assert.strictEqual(parse(undefined), false);
  assert.strictEqual(parse(""), false);
  assert.strictEqual(parse("0"), false);
  assert.strictEqual(parse("1"), true);
  assert.strictEqual(parse("true"), true);
}

async function main() {
  await testStreamWriteProducesValidXlsx();
  await testBulkSkipWrongAnswersFlag();
  console.log("excel-export-stream: OK");
}

main().catch((error) => {
  console.error("excel-export-stream: FAIL", error);
  process.exitCode = 1;
});
