const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const dayjs = require("dayjs");

const ExportJob = require("../models/ExportJob");
const Cuocthis = require("../models/Cuocthi");
const LichsuThis = require("../models/LichsuThi");
const { buildDemographicMongoFilter } = require("../utils/demographicFilters");
const {
  EXPORT_TTL_DAYS,
  CSV_MAX_ROWS_PER_FILE,
  getCsvHeaders,
  ensureExportDir,
  csvLine,
  baithiToCsvValues,
  parseExportParams,
  buildCreatedAtFilter,
  calcXeploai,
  decryptField,
} = require("../utils/ketquaExport");

const CONCURRENCY = 1;
let activeWorkers = 0;
const pendingIds = [];
const pendingSet = new Set();
let started = false;
let cleanupTimer = null;

function getUserId(req) {
  return req.user?._id || req.userId?.userId || null;
}

async function createKetquaExportJob(userId, type, rawParams) {
  const params = parseExportParams({ ...rawParams, type });
  if (!params.ids.length) {
    const err = new Error("Thiếu danh sách cuộc thi để xuất");
    err.status = 400;
    throw err;
  }

  // Ép quy tắc: one = có câu sai; many = không câu sai
  const resolvedType = type === "ketqua-one" || type === "ketqua-many" ? type : params.type;
  params.type = resolvedType;
  params.includeWrongAnswers = resolvedType === "ketqua-one";

  const active = await ExportJob.findOne({
    userId,
    status: { $in: ["queued", "running"] },
  }).select("_id status");
  if (active) {
    const err = new Error(
      "Bạn đang có một job xuất đang chạy. Vui lòng đợi xong hoặc tải file trước khi tạo job mới."
    );
    err.status = 409;
    err.jobId = active._id;
    throw err;
  }

  const expiresAt = dayjs().add(EXPORT_TTL_DAYS, "day").toDate();
  const job = await ExportJob.create({
    userId,
    type: resolvedType,
    params,
    status: "queued",
    progress: { processedRows: 0, totalEstimate: 0, percent: 0 },
    message: params.includeWrongAnswers
      ? "Đang chờ xử lý (kèm câu sai)"
      : "Đang chờ xử lý",
    expiresAt,
  });

  enqueueExportJob(String(job._id));
  return job;
}

function enqueueExportJob(jobId) {
  const id = String(jobId);
  if (pendingSet.has(id)) return;
  pendingSet.add(id);
  pendingIds.push(id);
  pumpQueue();
}

function pumpQueue() {
  while (activeWorkers < CONCURRENCY && pendingIds.length) {
    const jobId = pendingIds.shift();
    pendingSet.delete(jobId);
    activeWorkers += 1;
    processJob(jobId)
      .catch((err) => {
        console.error("[exportJob] process error", jobId, err.message);
      })
      .finally(() => {
        activeWorkers -= 1;
        setImmediate(pumpQueue);
      });
  }
}

async function updateProgress(jobId, patch) {
  await ExportJob.findByIdAndUpdate(jobId, {
    $set: patch,
  });
}

function matchesSoftFilters(baithi, soluongcauhoi, { xeploai, hoten }) {
  const xeploaiFilter = String(xeploai || "");
  const hotenFilter = String(hoten || "").toUpperCase();
  if (!xeploaiFilter && !hotenFilter) return true;

  const name = decryptField(baithi.thongtinthisinh?.name).toUpperCase();
  const xl = calcXeploai(baithi.socaudung, soluongcauhoi);
  if (xeploaiFilter && !String(xl).includes(xeploaiFilter)) return false;
  if (hotenFilter && !name.includes(hotenFilter)) return false;
  return true;
}

class CsvZipWriter {
  constructor(jobId, headers) {
    this.jobId = jobId;
    this.headers = headers;
    this.tmpDir = path.join(ensureExportDir(), `tmp_${jobId}`);
    this.writers = new Map();
    this.yearOverflow = new Set();
    this.filePaths = [];
    fs.mkdirSync(this.tmpDir, { recursive: true });
  }

  _openFile(fileName) {
    const filePath = path.join(this.tmpDir, fileName);
    const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
    stream.write("\uFEFF");
    stream.write(csvLine(this.headers));
    this.filePaths.push(filePath);
    return { stream, count: 0, fileName, filePath };
  }

  _resolveKey(createdAt) {
    const d = dayjs(createdAt);
    if (!d.isValid()) return "unknown";
    const year = d.format("YYYY");
    if (this.yearOverflow.has(year)) {
      return d.format("YYYY-MM");
    }
    return year;
  }

  writeRow(createdAt, values) {
    let key = this._resolveKey(createdAt);
    let entry = this.writers.get(key);

    if (entry && entry.count >= CSV_MAX_ROWS_PER_FILE) {
      if (/^\d{4}$/.test(key)) {
        this.yearOverflow.add(key);
        entry.stream.end();
        this.writers.delete(key);
        key = dayjs(createdAt).format("YYYY-MM");
        entry = this.writers.get(key);
      } else {
        entry.stream.end();
        this.writers.delete(key);
        const nextPart = (entry.partIndex || 1) + 1;
        const fileName = `KetQua_${key}_p${nextPart}.csv`;
        entry = this._openFile(fileName);
        entry.partIndex = nextPart;
        this.writers.set(key, entry);
      }
    }

    if (!entry) {
      const fileName = `KetQua_${key}.csv`;
      entry = this._openFile(fileName);
      entry.partIndex = 1;
      this.writers.set(key, entry);
    }

    entry.stream.write(csvLine(values));
    entry.count += 1;
  }

  async finalizeZip(outFileName) {
    for (const entry of this.writers.values()) {
      await new Promise((resolve, reject) => {
        entry.stream.end(() => resolve());
        entry.stream.on("error", reject);
      });
    }
    this.writers.clear();

    const outPath = path.join(ensureExportDir(), outFileName);
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.pipe(output);
      for (const filePath of this.filePaths) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
      archive.finalize();
    });

    this.cleanupTmp();
    return outPath;
  }

  cleanupTmp() {
    try {
      if (fs.existsSync(this.tmpDir)) {
        fs.rmSync(this.tmpDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn("[exportJob] cleanup tmp failed", err.message);
    }
  }
}

async function estimateTotal(params) {
  const { filter: demographicFilter } = buildDemographicMongoFilter(params);
  const createdAt = buildCreatedAtFilter(params.tungay, params.denngay);
  let total = 0;
  for (const id of params.ids) {
    const mongoFilter = {
      id_cuocthi: id,
      thoigiannopbai: { $gt: 0 },
      ...demographicFilter,
    };
    if (createdAt) mongoFilter.createdAt = createdAt;
    total += await LichsuThis.countDocuments(mongoFilter);
  }
  return total;
}

async function processJob(jobId) {
  const job = await ExportJob.findById(jobId);
  if (!job || job.status === "ready" || job.status === "failed") return;
  if (job.status !== "queued" && job.status !== "running") return;

  await updateProgress(jobId, {
    status: "running",
    message: "Đang đọc dữ liệu…",
    error: "",
  });

  const params = parseExportParams(job.params || {});
  // Job cũ có thể thiếu flag — suy từ type
  const includeWrongAnswers =
    job.type === "ketqua-one" || !!params.includeWrongAnswers;
  params.includeWrongAnswers = includeWrongAnswers;

  const writer = new CsvZipWriter(jobId, getCsvHeaders(includeWrongAnswers));

  try {
    const totalEstimate = await estimateTotal(params);
    await updateProgress(jobId, {
      "progress.totalEstimate": totalEstimate,
      "progress.processedRows": 0,
      "progress.percent": 0,
      message: includeWrongAnswers
        ? `Ước lượng ${totalEstimate.toLocaleString("vi-VN")} dòng (kèm câu sai)`
        : `Ước lượng ${totalEstimate.toLocaleString("vi-VN")} dòng`,
    });

    const { filter: demographicFilter } = buildDemographicMongoFilter(params);
    const createdAt = buildCreatedAtFilter(params.tungay, params.denngay);
    let processedRows = 0;
    let lastProgressAt = Date.now();

    for (const id of params.ids) {
      const cuocthi = await Cuocthis.findById(id)
        .select("tencuocthi soluongcauhoi")
        .lean();
      if (!cuocthi) continue;

      const mongoFilter = {
        id_cuocthi: id,
        thoigiannopbai: { $gt: 0 },
        ...demographicFilter,
      };
      if (createdAt) mongoFilter.createdAt = createdAt;

      let query = LichsuThis.find(mongoFilter);
      if (includeWrongAnswers) {
        query = query
          .select(
            "createdAt socaudung thongtinthisinh thoigianbatdau thoigiannopbai soluongcauhoi questions"
          )
          .populate({
            path: "questions.question",
            select: "answer question",
          });
      } else {
        query = query.select(
          "createdAt socaudung thongtinthisinh thoigianbatdau thoigiannopbai soluongcauhoi"
        );
      }

      const cursor = query
        .sort({ socaudung: -1, thoigiannopbai: 1 })
        .lean()
        .cursor({ batchSize: includeWrongAnswers ? 200 : 500 });

      let rank = 0;
      for await (const baithi of cursor) {
        if (
          !matchesSoftFilters(baithi, cuocthi.soluongcauhoi, {
            xeploai: params.xeploai,
            hoten: params.hoten,
          })
        ) {
          continue;
        }
        rank += 1;
        const values = baithiToCsvValues(baithi, {
          tencuocthi: cuocthi.tencuocthi || "",
          soluongcauhoi: cuocthi.soluongcauhoi,
          rank,
          includeWrongAnswers,
        });
        writer.writeRow(baithi.createdAt, values);
        processedRows += 1;

        const now = Date.now();
        if (now - lastProgressAt > 1500 || processedRows % 2000 === 0) {
          lastProgressAt = now;
          const percent =
            totalEstimate > 0
              ? Math.min(99, Math.floor((processedRows / totalEstimate) * 100))
              : 0;
          await updateProgress(jobId, {
            "progress.processedRows": processedRows,
            "progress.percent": percent,
            message: `Đã ghi ${processedRows.toLocaleString("vi-VN")} dòng`,
          });
        }
      }
    }

    const stamp = dayjs().format("YYYYMMDD_HHmmss");
    const fileName =
      params.ids.length === 1
        ? `KetQuaThi_${params.ids[0]}_${stamp}.zip`
        : `KetQuaThi_tat_ca_${stamp}.zip`;

    await updateProgress(jobId, {
      message: "Đang đóng gói ZIP…",
      "progress.processedRows": processedRows,
      "progress.percent": 99,
    });

    const filePath = await writer.finalizeZip(fileName);

    await ExportJob.findByIdAndUpdate(jobId, {
      $set: {
        status: "ready",
        filePath,
        fileName,
        message: "Sẵn sàng tải xuống",
        "progress.processedRows": processedRows,
        "progress.percent": 100,
        error: "",
      },
    });
  } catch (error) {
    console.error("[exportJob] failed", jobId, error);
    writer.cleanupTmp();
    await ExportJob.findByIdAndUpdate(jobId, {
      $set: {
        status: "failed",
        error: error.message || "Xuất file thất bại",
        message: "Thất bại",
      },
    });
  }
}

async function requeueInterruptedJobs() {
  const result = await ExportJob.updateMany(
    { status: "running" },
    {
      $set: {
        status: "queued",
        message: "Chờ chạy lại sau khi server khởi động",
      },
    }
  );
  if (result.modifiedCount) {
    console.log(
      `[exportJob] re-queued ${result.modifiedCount} interrupted job(s)`
    );
  }
  const queued = await ExportJob.find({ status: "queued" }).select("_id");
  for (const job of queued) {
    enqueueExportJob(String(job._id));
  }
}

async function cleanupExpiredExports() {
  const now = new Date();
  const expired = await ExportJob.find({
    expiresAt: { $lte: now },
  }).select("_id filePath");

  for (const job of expired) {
    if (job.filePath && fs.existsSync(job.filePath)) {
      try {
        fs.unlinkSync(job.filePath);
      } catch (err) {
        console.warn("[exportJob] unlink failed", err.message);
      }
    }
    const tmpDir = path.join(ensureExportDir(), `tmp_${job._id}`);
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        /* ignore */
      }
    }
    await ExportJob.deleteOne({ _id: job._id });
  }

  if (expired.length) {
    console.log(`[exportJob] cleaned ${expired.length} expired export(s)`);
  }
}

function startExportWorker() {
  if (started) return;
  started = true;
  ensureExportDir();
  requeueInterruptedJobs().catch((err) =>
    console.error("[exportJob] requeue failed", err.message)
  );
  cleanupExpiredExports().catch((err) =>
    console.error("[exportJob] cleanup failed", err.message)
  );
  cleanupTimer = setInterval(() => {
    cleanupExpiredExports().catch((err) =>
      console.error("[exportJob] cleanup failed", err.message)
    );
  }, 60 * 60 * 1000);
  if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
  console.log("[exportJob] worker started");
}

module.exports = {
  getUserId,
  createKetquaExportJob,
  enqueueExportJob,
  startExportWorker,
  cleanupExpiredExports,
  processJob,
};
