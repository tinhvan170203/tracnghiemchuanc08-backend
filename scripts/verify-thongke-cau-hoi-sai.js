/**
 * Rà soát schema + chạy pipeline top 15 câu hay sai trên DB thật.
 * Không in URI / dữ liệu cá nhân.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Cauhois = require("../models/CauHoi");
const Cuocthis = require("../models/Cuocthi");
const LichsuThis = require("../models/LichsuThi");

function cham(choice, answer) {
  const da_tra_loi = choice == null ? false : choice;
  const is_khong_tra_loi = da_tra_loi === false ? 1 : 0;
  const is_sai =
    da_tra_loi !== false && choice !== answer ? 1 : 0;
  return { is_khong_tra_loi, is_sai };
}

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

async function main() {
  // 1) Logic chấm giống pipeline
  assert(cham(undefined, "option_a").is_khong_tra_loi === 1, "không chọn = bỏ trống");
  assert(cham(undefined, "option_a").is_sai === 0, "không chọn không tính sai");
  assert(cham("option_a", "option_a").is_sai === 0, "đúng thì không sai");
  assert(cham("option_b", "option_a").is_sai === 1, "chọn khác đáp án = sai");
  assert(cham("", "option_a").is_sai === 1, "choice rỗng (nộp bài) đang được pipeline cũ tính là sai");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("SKIP DB: không có MONGODB_URI");
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log("DB connected");

  const sample = await LichsuThis.findOne().lean();
  assert(!!sample, "có ít nhất 1 lịch sử thi");
  const keys = Object.keys(sample);
  assert(keys.includes("id_cuocthi"), "field id_cuocthi");
  assert(Array.isArray(sample.questions), "questions là mảng");
  const q0 = sample.questions[0] || {};
  assert(Object.prototype.hasOwnProperty.call(q0, "question"), "questions.question");
  console.log("sample question keys:", Object.keys(q0).join(", "));
  console.log("sample has choice:", Object.prototype.hasOwnProperty.call(q0, "choice"));

  const cauhoi = await Cauhois.findById(q0.question).lean();
  if (cauhoi) {
    console.log("cauhoi keys:", ["answer", "chuyende", "chuyendeString"].filter((k) => k in cauhoi).join(", "));
    assert("answer" in cauhoi, "CauHoi.answer");
    assert("chuyende" in cauhoi, "CauHoi.chuyende");
  }

  const nCuocthi = await Cuocthis.countDocuments();
  const nLichsu = await LichsuThis.countDocuments();
  console.log("counts:", { nCuocthi, nLichsu });

  const cuocthiIds = await Cuocthis.find().distinct("_id");
  const pipeline = [
    {
      $match: {
        id_cuocthi: { $in: cuocthiIds },
      },
    },
    {
      $lookup: {
        from: "cauhois",
        localField: "questions.question",
        foreignField: "_id",
        as: "cauhoi_lookup",
      },
    },
    { $unwind: "$questions" },
    {
      $addFields: {
        cauhoi_info: {
          $first: {
            $filter: {
              input: "$cauhoi_lookup",
              cond: { $eq: ["$$this._id", "$questions.question"] },
            },
          },
        },
      },
    },
    { $match: { cauhoi_info: { $ne: null } } },
    {
      $addFields: {
        da_tra_loi: { $ifNull: ["$questions.choice", false] },
      },
    },
    {
      $addFields: {
        is_khong_tra_loi: {
          $cond: [{ $eq: ["$da_tra_loi", false] }, 1, 0],
        },
        is_sai: {
          $cond: [
            {
              $and: [
                { $ne: ["$da_tra_loi", false] },
                { $ne: ["$questions.choice", "$cauhoi_info.answer"] },
              ],
            },
            1,
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$questions.question",
        tong_luot_lam: { $sum: 1 },
        so_luot_sai: { $sum: "$is_sai" },
        so_luot_khong_tra_loi: { $sum: "$is_khong_tra_loi" },
        question: { $first: "$cauhoi_info.question" },
        chuyendeString: { $first: "$cauhoi_info.chuyendeString" },
      },
    },
    {
      $addFields: {
        so_luot_da_tra_loi: {
          $subtract: ["$tong_luot_lam", "$so_luot_khong_tra_loi"],
        },
      },
    },
    {
      $addFields: {
        ti_le_sai: {
          $cond: [
            { $eq: ["$so_luot_da_tra_loi", 0] },
            0,
            {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$so_luot_sai", "$so_luot_da_tra_loi"] },
                    100,
                  ],
                },
                2,
              ],
            },
          ],
        },
      },
    },
    { $sort: { ti_le_sai: -1, so_luot_sai: -1 } },
    { $limit: 15 },
  ];

  const items = await LichsuThis.aggregate(pipeline);
  assert(items.length <= 15, "tối đa 15 câu");
  console.log("items:", items.length);

  for (const it of items) {
    assert(it.ti_le_sai >= 0 && it.ti_le_sai <= 100, "ti_le_sai 0-100");
    assert(it.so_luot_sai <= it.so_luot_da_tra_loi, "sai <= đã trả lời");
    const expected =
      it.so_luot_da_tra_loi === 0
        ? 0
        : Math.round((it.so_luot_sai / it.so_luot_da_tra_loi) * 10000) / 100;
    // $round half-up may differ 0.01; allow tiny delta
    assert(Math.abs(it.ti_le_sai - expected) <= 0.05, "ti_le_sai khớp công thức");
  }

  if (items[0]) {
    console.log("top1:", {
      ti_le_sai: items[0].ti_le_sai,
      tong_luot_lam: items[0].tong_luot_lam,
      so_luot_sai: items[0].so_luot_sai,
      so_luot_khong_tra_loi: items[0].so_luot_khong_tra_loi,
      chuyendeString: items[0].chuyendeString,
      questionLen: (items[0].question || "").length,
    });
  }

  // Đối chiếu 1 bài đã nộp: đếm sai thủ công vs is_sai pipeline
  const submitted = await LichsuThis.findOne({
    "questions.choice": { $exists: true, $nin: [null, false] },
  })
    .select("questions")
    .lean();
  if (submitted) {
    let sai = 0;
    let trong = 0;
    let dung = 0;
    for (const q of submitted.questions) {
      const ch = await Cauhois.findById(q.question).select("answer").lean();
      if (!ch) continue;
      const r = cham(q.choice, ch.answer);
      if (r.is_khong_tra_loi) trong += 1;
      else if (r.is_sai) sai += 1;
      else dung += 1;
    }
    console.log("1 bài nộp — dung/sai/trong:", { dung, sai, trong, total: submitted.questions.length });
    assert(dung + sai + trong === submitted.questions.length, "dung+sai+trong = số câu");
  }

  const oneContest = await Cuocthis.findOne().select("monthi").lean();
  if (oneContest && oneContest.monthi) {
    const idsOfMonthi = await Cuocthis.find({ monthi: oneContest.monthi }).distinct("_id");
    const filtered = await LichsuThis.aggregate([
      { $match: { id_cuocthi: { $in: idsOfMonthi } } },
      {
        $lookup: {
          from: "cauhois",
          localField: "questions.question",
          foreignField: "_id",
          as: "cauhoi_lookup",
        },
      },
      { $unwind: "$questions" },
      {
        $addFields: {
          cauhoi_info: {
            $first: {
              $filter: {
                input: "$cauhoi_lookup",
                cond: { $eq: ["$$this._id", "$questions.question"] },
              },
            },
          },
        },
      },
      { $match: { cauhoi_info: { $ne: null } } },
      {
        $lookup: {
          from: "chuyendes",
          localField: "cauhoi_info.chuyende",
          foreignField: "_id",
          as: "cd",
        },
      },
      { $unwind: { path: "$cd", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$questions.question",
          monthiCuaChuyende: { $first: "$cd.monthi" },
        },
      },
      { $limit: 15 },
    ]);
    const leak = filtered.filter(
      (i) => i.monthiCuaChuyende && i.monthiCuaChuyende.toString() !== oneContest.monthi.toString()
    );
    assert(leak.length === 0, "lọc theo kiến thức đánh giá không lẫn chuyên đề môn khác");
    console.log("lọc monthi:", { contests: idsOfMonthi.length, questions: filtered.length });
  }

  const monthiCtrl = require("../controllers/monthi");
  assert(typeof monthiCtrl.thongKeCauHoiSaiTongHop === "function", "export thongKeCauHoiSaiTongHop");

  await mongoose.disconnect();
  console.log("DONE");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
