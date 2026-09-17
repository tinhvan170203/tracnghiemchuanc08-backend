/**
 * Split text into overlapping chunks for embedding / RAG.
 * Prefer splitting Vietnamese legal text by "Điều N" so fines stay with article numbers.
 */
function cleanText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkByLength(cleaned, { chunkSize = 1000, overlap = 150 } = {}) {
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    if (end < cleaned.length) {
      const slice = cleaned.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("。")
      );
      if (breakAt > chunkSize * 0.4) {
        end = start + breakAt + 1;
      }
    }

    const piece = cleaned.slice(start, end).trim();
    if (piece) chunks.push(piece);

    if (end >= cleaned.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

/** Find start indices of "Điều <số>" that look like article headings. */
function findDieuStarts(cleaned) {
  const indices = [];
  const re = /Điều\s+\d+/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const start = m.index;
    if (start === 0) {
      indices.push(start);
      continue;
    }
    const prev = cleaned[start - 1];
    if (prev === "\n" || prev === "." || prev === ";" || prev === ":") {
      indices.push(start);
      continue;
    }
    if (/\s/.test(prev)) {
      const lookBehind = cleaned.slice(Math.max(0, start - 12), start);
      if (lookBehind.includes("\n") || /(?:^|[.;:])\s*$/.test(lookBehind)) {
        indices.push(start);
      }
    }
  }
  return indices;
}

function splitByDieu(cleaned) {
  const indices = findDieuStarts(cleaned);
  if (indices.length < 2) return null;

  const articles = [];
  if (indices[0] > 80) {
    const pre = cleaned.slice(0, indices[0]).trim();
    if (pre) articles.push(pre);
  }

  for (let i = 0; i < indices.length; i++) {
    const from = indices[i];
    const to = i + 1 < indices.length ? indices[i + 1] : cleaned.length;
    const piece = cleaned.slice(from, to).trim();
    if (piece) articles.push(piece);
  }
  return articles.length >= 2 ? articles : null;
}

function chunkText(
  text,
  { chunkSize = 1200, overlap = 150, maxArticleChars = 3500 } = {}
) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const articles = splitByDieu(cleaned);
  if (!articles) {
    return chunkByLength(cleaned, { chunkSize, overlap });
  }

  const out = [];
  for (const article of articles) {
    if (article.length <= maxArticleChars) {
      out.push(article);
    } else {
      out.push(...chunkByLength(article, { chunkSize, overlap }));
    }
  }
  return out;
}

module.exports = { chunkText, splitByDieu, chunkByLength };
