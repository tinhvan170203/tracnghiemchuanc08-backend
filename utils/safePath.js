const path = require("path");
const fs = require("fs");

/**
 * Resolve filename safely inside baseDir. Rejects path traversal.
 * @returns {string|null} absolute path if safe and (optionally) exists
 */
function resolveSafeFilePath(baseDir, filename, { mustExist = true } = {}) {
  if (!filename || typeof filename !== "string") return null;

  // Chỉ lấy tên file, bỏ mọi ../ hoặc path separator
  const safeName = path.basename(filename);
  if (!safeName || safeName === "." || safeName === "..") return null;

  // Không cho ký tự nguy hiểm còn sót
  if (safeName !== filename.replace(/^.*[\\/]/, "")) return null;

  const root = path.resolve(baseDir);
  const target = path.resolve(root, safeName);

  if (!target.startsWith(root + path.sep) && target !== root) {
    return null;
  }

  if (mustExist && !fs.existsSync(target)) {
    return null;
  }

  return target;
}

function sendSafeFile(res, baseDir, filename, options = {}) {
  const filePath = resolveSafeFilePath(baseDir, filename, { mustExist: true });
  if (!filePath) {
    return res.status(400).json({ message: "Tên file không hợp lệ hoặc không tồn tại" });
  }
  return res.sendFile(filePath, options);
}

module.exports = {
  resolveSafeFilePath,
  sendSafeFile,
};
