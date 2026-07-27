const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

async function extractTextFromFile(filePath, originalName = "") {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  if (ext === ".pdf") {
    const pdfParse = require("pdf-parse");
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || "";
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }

  throw new Error(`Định dạng không hỗ trợ: ${ext || "unknown"}`);
}

module.exports = { extractTextFromFile };
