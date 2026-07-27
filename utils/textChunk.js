/**
 * Split text into overlapping chunks for embedding / RAG.
 */
function chunkText(text, { chunkSize = 1000, overlap = 150 } = {}) {
  const cleaned = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return [];

  if (cleaned.length <= chunkSize) {
    return [cleaned];
  }

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

module.exports = { chunkText };
