const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const MIN_MEANINGFUL_CHARS = 40;

function meaningfulLength(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim().length;
}

async function extractPdfWithUnpdf(buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || "");
}

async function extractPdfWithPdfParse(buffer) {
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return String(data.text || "");
}

async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);

  let text = "";
  let unpdfErr = null;
  try {
    text = await extractPdfWithUnpdf(buffer);
  } catch (err) {
    unpdfErr = err;
    console.error("unpdf extract error:", err.message);
  }

  if (meaningfulLength(text) >= MIN_MEANINGFUL_CHARS) {
    return text;
  }

  try {
    const fallback = await extractPdfWithPdfParse(buffer);
    if (meaningfulLength(fallback) > meaningfulLength(text)) {
      text = fallback;
    }
  } catch (err) {
    console.error("pdf-parse extract error:", err.message);
    if (!text && unpdfErr) {
      throw new Error(
        `Không đọc được PDF: ${unpdfErr.message || err.message}`
      );
    }
  }

  if (meaningfulLength(text) < MIN_MEANINGFUL_CHARS) {
    throw new Error(
      "PDF không có lớp chữ (có thể là file scan/ảnh). Hãy upload DOCX, TXT hoặc PDF chọn/copy được chữ."
    );
  }

  return text;
}

async function extractTextFromFile(filePath, originalName = "") {
  const ext = path.extname(originalName || filePath).toLowerCase();

  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  if (ext === ".pdf") {
    return extractPdfText(filePath);
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }

  throw new Error(`Định dạng không hỗ trợ: ${ext || "unknown"}`);
}

module.exports = { extractTextFromFile, extractPdfText };
