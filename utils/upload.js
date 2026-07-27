const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

function slugifyBaseName(str) {
  return String(str || "file")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "file";
}

function buildSafeFilename(originalname, allowedExts) {
  const decoded = Buffer.from(originalname || "file", "latin1").toString("utf8");
  let ext = path.extname(decoded).toLowerCase();
  if (!allowedExts.includes(ext)) {
    // fallback: không tin extension lạ
    ext = allowedExts[0] || "";
  }
  const base = slugifyBaseName(path.basename(decoded, path.extname(decoded)));
  const id = crypto.randomBytes(8).toString("hex");
  return `${Date.now()}-${id}-${base}${ext}`;
}

function createUploader({
  destDir,
  allowedExts,
  allowedMimes,
  maxFileSize,
}) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, destDir);
    },
    filename: (_req, file, cb) => {
      try {
        cb(null, buildSafeFilename(file.originalname, allowedExts));
      } catch (err) {
        cb(err);
      }
    },
  });

  const fileFilter = (_req, file, cb) => {
    const decoded = Buffer.from(file.originalname || "", "latin1").toString("utf8");
    const ext = path.extname(decoded).toLowerCase();
    const mimeOk = allowedMimes.includes(file.mimetype);
    const extOk = allowedExts.includes(ext);

    if (mimeOk && extOk) {
      return cb(null, true);
    }
    return cb(
      new Error(
        `File không được phép. Cho phép: ${allowedExts.join(", ")}`
      )
    );
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxFileSize,
      files: 1,
    },
  });
}

/** Tài liệu: pdf/doc/docx/xls/xlsx/ppt/pptx/zip/images — max 20MB */
const docsUpload = createUploader({
  destDir: path.join(__dirname, "../upload"),
  allowedExts: [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".zip",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
  ],
  allowedMimes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ],
  maxFileSize: 20 * 1024 * 1024,
});

/** Ảnh câu hỏi — max 5MB */
const imageUpload = createUploader({
  destDir: path.join(__dirname, "../upload"),
  allowedExts: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  allowedMimes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  maxFileSize: 5 * 1024 * 1024,
});

/** Video tuyên truyền — max 200MB */
const videoUpload = createUploader({
  destDir: path.join(__dirname, "../public"),
  allowedExts: [".mp4", ".webm", ".ogg", ".mov"],
  allowedMimes: [
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
  ],
  maxFileSize: 200 * 1024 * 1024,
});

/** Middleware bắt lỗi multer (size/type) trả JSON rõ ràng */
function handleMulterError(err, _req, res, next) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File vượt quá dung lượng cho phép" });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err.message) {
    return res.status(400).json({ message: err.message });
  }
  return next(err);
}

module.exports = {
  docsUpload,
  imageUpload,
  videoUpload,
  createUploader,
  handleMulterError,
  buildSafeFilename,
};
