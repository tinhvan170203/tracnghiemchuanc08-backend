const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const dayjs = require("dayjs");

const SYNC_EXPORT_ROW_LIMIT = 5000;
const EXPORT_TTL_DAYS = 7;
const EXPORT_DIR = path.join(__dirname, "..", "exports");
const CSV_MAX_ROWS_PER_FILE = 900000;

const CSV_HEADERS = [
  "xephang",
  "tencuocthi",
  "hoten",
  "ngaysinh",
  "gioitinh",
  "loaixe",
  "hang_gplx",
  "nghenghiep",
  "diachi",
  "phone",
  "socaudung",
  "xeploai",
  "thoigianbatdau",
  "thoigianketthuc",
  "thoigianlambai",
];

const CSV_HEADERS_WITH_WRONG = [...CSV_HEADERS, "cautraloisai"];

function getCsvHeaders(includeWrongAnswers) {
  return includeWrongAnswers ? CSV_HEADERS_WITH_WRONG : CSV_HEADERS;
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Danh sách câu sai (đã populate questions.question). */
function buildCautraloisaiText(questions = []) {
  const wrong = [];
  for (const q of questions) {
    const qDoc = q.question;
    if (!qDoc) continue;
    const choice = q.choice || "";
    if (choice === qDoc.answer) continue;
    wrong.push(stripHtml(qDoc.question || ""));
  }
  if (!wrong.length) return "";
  return wrong.map((text, i) => `${i + 1}. ${text}`).join("\n");
}

function ensureExportDir() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
  return EXPORT_DIR;
}

function decryptField(encryptedText) {
  if (encryptedText == null || encryptedText === "") return "";
  const raw = String(encryptedText);
  if (!raw.includes(":")) return raw;
  try {
    const textParts = raw.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedData = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      process.env.SECRET_KEY,
      iv
    );
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (_) {
    return raw;
  }
}

function calcXeploai(socaudung, soluongcauhoi) {
  const totalQ = Number(soluongcauhoi) || 1;
  const ratio = Number(socaudung || 0) / totalQ;
  if (ratio < 0.5) return "Không đạt";
  if (ratio < 0.7) return "Trung bình";
  if (ratio < 0.8) return "Khá";
  if (ratio < 0.9) return "Giỏi";
  return "Xuất sắc";
}

function formatMsDuration(ms) {
  if (!ms || ms < 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} phút ${String(s).padStart(2, "0")} giây`;
}

function formatTimestamp(ts) {
  if (!ts) return "";
  return dayjs(Number(ts)).format("DD/MM/YYYY HH:mm:ss");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvLine(values) {
  return `${values.map(escapeCsv).join(",")}\n`;
}

function baithiToCsvValues(
  baithi,
  { tencuocthi, soluongcauhoi, rank, includeWrongAnswers = false }
) {
  const tt = baithi.thongtinthisinh || {};
  const name = decryptField(tt.name);
  const donvi = decryptField(tt.donvi);
  const phone = decryptField(tt.phone);
  const duration =
    baithi.thoigiannopbai && baithi.thoigianbatdau
      ? Number(baithi.thoigiannopbai) - Number(baithi.thoigianbatdau)
      : 0;

  const values = [
    rank,
    tencuocthi || "",
    name,
    tt.birthday || "",
    tt.gioitinh || "",
    tt.loaixe || "",
    tt.hang_gplx || "",
    tt.nghenghiep || "",
    `${phone} - ${tt.hokhau || ""}`,
    donvi,
    baithi.socaudung ?? "",
    calcXeploai(baithi.socaudung, soluongcauhoi || baithi.soluongcauhoi),
    formatTimestamp(baithi.thoigianbatdau),
    formatTimestamp(baithi.thoigiannopbai),
    formatMsDuration(duration),
  ];

  if (includeWrongAnswers) {
    values.push(buildCautraloisaiText(baithi.questions || []));
  }
  return values;
}

function parseExportParams(raw = {}) {
  const idList = Array.isArray(raw.ids)
    ? raw.ids.map(String)
    : String(raw.ids || raw.id || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const type =
    raw.type === "ketqua-one" || raw.type === "ketqua-many"
      ? raw.type
      : idList.length === 1
        ? "ketqua-one"
        : "ketqua-many";

  // Từng cuộc: luôn kèm câu sai. Xuất nhiều/tất cả: không kèm (tối ưu).
  const includeWrongAnswers =
    type === "ketqua-one" ||
    String(raw.includeWrongAnswers || "").trim() === "1" ||
    String(raw.includeWrongAnswers || "").toLowerCase() === "true";

  return {
    ids: idList,
    type,
    includeWrongAnswers: type === "ketqua-many" ? false : !!includeWrongAnswers,
    tungay: raw.tungay || "",
    denngay: raw.denngay || "",
    xeploai: raw.xeploai || "",
    hoten: raw.hoten || "",
    ageFrom: raw.ageFrom || "",
    ageTo: raw.ageTo || "",
    gioitinh: raw.gioitinh || "",
    loaixe: raw.loaixe || "",
  };
}

function buildCreatedAtFilter(tungay, denngay) {
  if (!tungay && !denngay) return null;
  const range = {};
  if (tungay) {
    const from = new Date(`${tungay}T00:00:00`);
    if (!Number.isNaN(from.getTime())) range.$gte = from;
  }
  if (denngay) {
    const to = new Date(`${denngay}T00:00:00`);
    if (!Number.isNaN(to.getTime())) {
      to.setDate(to.getDate() + 1);
      range.$lt = to;
    }
  }
  return Object.keys(range).length ? range : null;
}

function partitionKeyFromDate(createdAt) {
  const d = dayjs(createdAt);
  if (!d.isValid()) return "unknown";
  return d.format("YYYY");
}

function partitionFileName(key, partIndex) {
  if (partIndex <= 1) return `KetQua_${key}.csv`;
  return `KetQua_${key}_p${partIndex}.csv`;
}

module.exports = {
  SYNC_EXPORT_ROW_LIMIT,
  EXPORT_TTL_DAYS,
  EXPORT_DIR,
  CSV_MAX_ROWS_PER_FILE,
  CSV_HEADERS,
  CSV_HEADERS_WITH_WRONG,
  getCsvHeaders,
  ensureExportDir,
  decryptField,
  calcXeploai,
  formatMsDuration,
  formatTimestamp,
  escapeCsv,
  csvLine,
  stripHtml,
  buildCautraloisaiText,
  baithiToCsvValues,
  parseExportParams,
  buildCreatedAtFilter,
  partitionKeyFromDate,
  partitionFileName,
};
