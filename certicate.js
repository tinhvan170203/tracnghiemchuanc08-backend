const sharp = require("sharp");
const path = require("path");
const PDFDocument = require("pdfkit");

const {
  createCanvas,
  registerFont
} = require("canvas");

// Đăng ký font cho node-canvas (chỉ dùng để đo chữ)
registerFont(
  path.join(__dirname, "fonts/NotoSans-Regular.ttf"),
  { family: "Noto Sans" }
);

registerFont(
  path.join(__dirname, "fonts/NotoSans-Bold.ttf"),
  { family: "Noto Sans Bold" }
);

// Khởi tạo một canvas cố định ngoài hàm để đo chữ, tránh rò rỉ bộ nhớ
const measurementCanvas = createCanvas(1, 1);
const measurementCtx = measurementCanvas.getContext("2d");

function msToHMS(ms) {
  if (ms < 0) ms = 0;
  let seconds = ms / 1000;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  const formattedSeconds = Math.floor(seconds).toString().padStart(2, "0");

  if (hours === 0) {
    return `${minutes} phút ${formattedSeconds} giây`;
  }
  return `${hours} giờ ${minutes} phút ${formattedSeconds} giây`;
}

function formatDate(timestamp) {
  const date = new Date(Number(timestamp));
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitTextByWidth(text, maxWidth, fontSize, fontFamily) {
  measurementCtx.font = `${fontSize}px "${fontFamily}"`;

  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = measurementCtx.measureText(testLine).width;

    if (width > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

function getNameFontSize(name = "") {
  const len = name.length;
  if (len <= 20) return 64;
  if (len <= 30) return 56;
  if (len <= 40) return 48;
  return 42;
}

async function generateCertificate(data) {
  const {
    name,
    tencuocthi,
    mabaithi,
    socaudung,
    socauhoi,
    time,
    thoigianbatdau
  } = data;

  const backgroundPath = path.join(
    __dirname,
    "public/c08chungnhan.png"
  );

  const meta = await sharp(backgroundPath).metadata();
  const width = meta.width;
  const height = meta.height;
  const centerX = width / 2;

  // --- Tính tỷ lệ pixel -> point dựa trên DPI thật của ảnh ---
  // 1 point = 1/72 inch. Nếu ảnh có density (DPI) khác 96, phải quy đổi
  // đúng để trang PDF có kích thước vật lý (khi in) chính xác.
  // Nếu ảnh không nhúng thông tin density, mặc định coi là 96 DPI.
  const dpi = meta.density && meta.density > 0 ? meta.density : 96;
  const scale = 72 / dpi;
  const pdfWidth = width * scale;
  const pdfHeight = height * scale;

  const nameFontSize = getNameFontSize(name);

  const contestLines = splitTextByWidth(
    `Tại: ${tencuocthi || ""}`,
    1300,
    30,
    "Noto Sans"
  );

  let contestSvg = "";
  contestLines.forEach((line, index) => {
    contestSvg += `<tspan x="${centerX}" dy="${index === 0 ? 0 : 40}">${escapeXml(
      line.trim()
    )}</tspan>`;
  });

  const svg = `
  <svg
    width="${width}"
    height="${height}"
    xmlns="http://www.w3.org/2000/svg">

    <style>
      .name{
        font-family:'Noto Sans', 'Segoe UI', Arial, sans-serif;
        font-size:${nameFontSize}px;
        font-weight:bold;
        fill:#163f85;
      }
      .normal{
        font-family:'Noto Sans', 'Segoe UI', Arial, sans-serif;
        font-size:30px;
        fill:#444;
      }
      .contest{
        font-family:'Noto Sans', 'Segoe UI', Arial, sans-serif;
        font-size:30px;
        fill:#9f1239;
        font-style:italic;
      }
    </style>

    <!-- TÊN -->
    <text
      x="${centerX}"
      y="680"
      text-anchor="middle"
      class="name">
      ${escapeXml((name || "").toUpperCase())}
    </text>

    <!-- KẾT QUẢ -->
    <text
      x="${centerX}"
      y="780"
      text-anchor="middle"
      class="normal">
      Đã hoàn thành ${socaudung}/${socauhoi} câu trả lời đúng trong ${escapeXml(msToHMS(time))}
    </text>

    <!-- CUỘC THI -->
    <text
      x="${centerX}"
      y="920"
      text-anchor="middle"
      class="contest">
      ${contestSvg}
    </text>

    <!-- MÃ BÀI THI -->
    <text
      x="${centerX}"
      y="1120"
      text-anchor="middle"
      class="normal">
      Mã bài thi: ${escapeXml(mabaithi)}
    </text>

    <!-- NGÀY -->
    <text
      x="${centerX}"
      y="1170"
      text-anchor="middle"
      class="normal">
      Ngày chứng nhận: ${escapeXml(formatDate(thoigianbatdau))}
    </text>
  </svg>
  `;

  // 1. Tạo buffer ảnh PNG chất lượng cao từ Sharp trước
  const pngBuffer = await sharp(backgroundPath)
    .composite([
      {
        input: Buffer.from(svg)
      }
    ])
    .png()
    .toBuffer();

  // 2. Chuyển đổi ảnh PNG đó thành một trang PDF vừa khít kích thước,
  //    dùng scale tính từ DPI thật thay vì hằng số 0.75 cố định
  return new Promise((resolve, reject) => {
    const chunks = [];

    const doc = new PDFDocument({
      size: [pdfWidth, pdfHeight],
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));

    doc.image(pngBuffer, 0, 0, {
      width: pdfWidth,
      height: pdfHeight
    });

    doc.end();
  });
}

module.exports = generateCertificate;