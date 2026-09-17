/**
 * Read-only integration checks against the configured MongoDB.
 * No records are created, updated or deleted.
 */
require("dotenv").config();
const assert = require("assert");
const mongoose = require("mongoose");
const connectDB = require("../connectDB");
const LichsuThi = require("../models/LichsuThi");
const Cuocthi = require("../models/Cuocthi");
const monthiController = require("../controllers/monthi");
const commonController = require("../controllers/common");

function mockResponse() {
  const result = { statusCode: 200, body: undefined };
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
    send(body) {
      result.body = body;
      return this;
    },
    setHeader() {},
  };
}

async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res.result;
}

function classificationTotal(body) {
  return (
    Number(body.total_khongdat || body.khongdat || 0) +
    Number(body.total_trungbinh || body.trungbinh || 0) +
    Number(body.total_kha || body.kha || 0) +
    Number(body.total_gioi || body.gioi || 0) +
    Number(body.total_xuatsac || body.xuatsac || 0)
  );
}

async function main() {
  await connectDB();
  assert.strictEqual(mongoose.connection.readyState, 1, "MongoDB must be connected");

  const sample = await LichsuThi.findOne({
    thoigiannopbai: { $gt: 0 },
    "thongtinthisinh.birthday": /^\d{4}$/,
    "thongtinthisinh.gioitinh": { $in: ["Nam", "Nữ"] },
    "thongtinthisinh.loaixe": { $in: [
      "Ô tô khách",
      "Xe tải",
      "Xe đầu kéo",
      "Xe mô tô",
      "Xe con",
      "Xe gắn máy",
    ] },
  })
    .select("id_cuocthi thongtinthisinh createdAt")
    .lean();

  if (!sample) {
    console.log("SKIP_DB_DATA: Không có bài thi đủ năm sinh/giới tính/phương tiện");
    return;
  }

  const contest = await Cuocthi.findById(sample.id_cuocthi)
    .select("_id monthi createdAt")
    .lean();
  assert.ok(contest, "Sample contest must exist");

  const currentYear = new Date().getFullYear();
  const birthday = Number(sample.thongtinthisinh.birthday);
  const age = currentYear - birthday;
  const matching = {
    ageFrom: String(age),
    ageTo: String(age),
    gioitinh: sample.thongtinthisinh.gioitinh,
    loaixe: sample.thongtinthisinh.loaixe,
  };

  const contestResult = await invoke(monthiController.getKetquathi, {
    params: { id: String(contest._id) },
    query: { ...matching, page: "1", limit: "100" },
  });
  assert.strictEqual(contestResult.statusCode, 200);
  assert.ok(contestResult.body.total >= 1, "Matching participant must be returned");
  assert.strictEqual(
    classificationTotal(contestResult.body.summary),
    contestResult.body.summary.totalNopbai,
    "Contest result groups must sum to submitted total"
  );
  for (const row of contestResult.body.data) {
    assert.strictEqual(row.thongtinthisinh.gioitinh, matching.gioitinh);
    assert.strictEqual(row.thongtinthisinh.loaixe, matching.loaixe);
    assert.strictEqual(currentYear - Number(row.thongtinthisinh.birthday), age);
  }

  const impossibleResult = await invoke(monthiController.getKetquathi, {
    params: { id: String(contest._id) },
    query: {
      ageFrom: age < 120 ? String(age + 1) : "0",
      ageTo: age < 120 ? String(age + 1) : "0",
      gioitinh: matching.gioitinh,
      loaixe: matching.loaixe,
      page: "1",
      limit: "100",
    },
  });
  assert.strictEqual(impossibleResult.statusCode, 200);
  assert.ok(
    impossibleResult.body.total <= contestResult.body.total,
    "Different age filter must not increase the matched set"
  );

  const invalidResult = await invoke(monthiController.getKetquathi, {
    params: { id: String(contest._id) },
    query: { ageFrom: "50", ageTo: "20" },
  });
  assert.strictEqual(invalidResult.statusCode, 400);

  const systemResult = await invoke(monthiController.thongke, {
    query: {
      fromDate: "1990-01-01",
      toDate: "2999-12-31",
      monthi: String(contest.monthi),
      ...matching,
    },
    user: { quantrinhomdonvi: [contest.monthi] },
  });
  assert.strictEqual(systemResult.statusCode, 200);
  assert.strictEqual(
    classificationTotal(systemResult.body),
    systemResult.body.total_nopbai,
    "System result groups must sum to submitted total"
  );

  const publicResult = await invoke(commonController.publicThongke, {
    query: {
      fromDate: "1990-01-01",
      toDate: "2999-12-31",
      ...matching,
    },
  });
  assert.strictEqual(publicResult.statusCode, 200);
  assert.strictEqual(publicResult.body.filterVersion, 1);
  assert.deepStrictEqual(publicResult.body.appliedFilters, {
    ageFrom: age,
    ageTo: age,
    gioitinh: matching.gioitinh,
    loaixe: matching.loaixe,
  });
  assert.strictEqual(
    classificationTotal(publicResult.body),
    publicResult.body.total_nopbai,
    "Public result groups must sum to submitted total"
  );

  const wrongQuestions = await invoke(monthiController.thongKeCauHoiSai, {
    query: {
      idCuocThi: String(contest._id),
      ...matching,
    },
  });
  assert.strictEqual(wrongQuestions.statusCode, 200);
  assert.ok(Array.isArray(wrongQuestions.body));

  console.log("demographic-integration: OK", {
    contestId: String(contest._id),
    matchedRows: contestResult.body.total,
    gender: matching.gioitinh,
    vehicle: matching.loaixe,
    age,
  });
}

main()
  .catch((error) => {
    console.error("demographic-integration: FAIL", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
