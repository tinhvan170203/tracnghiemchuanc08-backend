/**
 * Ký cam kết — CRUD mẫu + gắn cuộc thi + ký sau nộp bài (public).
 */
const crypto = require("crypto");
const CamKetTemplates = require("../models/CamKetTemplate");
const Cuocthis = require("../models/Cuocthi");
const LichsuThis = require("../models/LichsuThi");
const {
  assertCanAccessCuocthi,
} = require("../utils/cuocthiAccess");

function decryptName(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== "string") return "";
    if (!encryptedText.includes(":")) return String(encryptedText);
    const textParts = encryptedText.split(":");
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
  } catch {
    return String(encryptedText || "");
  }
}
const MAX_SIGNATURE_CHARS = 900_000; // ~0.9MB data URL

function normalizeOptions(options) {
  return (Array.isArray(options) ? options : [])
    .map((o, i) => ({
      value: String(o?.value || o?.label || `opt_${i + 1}`).trim(),
      label: String(o?.label || o?.value || `Lựa chọn ${i + 1}`).trim(),
    }))
    .filter((o) => o.label);
}

function normalizeQuestions(questions) {
  return (Array.isArray(questions) ? questions : []).map((q, i) => ({
    key: String(q?.key || `q_${i + 1}`).trim() || `q_${i + 1}`,
    noiDung: String(q?.noiDung || q?.label || "").trim(),
    type: q?.type === "multi" ? "multi" : "single",
    options: normalizeOptions(q?.options),
    required: q?.required !== false,
  })).filter((q) => q.noiDung);
}

function normalizeFreeText(ft) {
  const src = ft && typeof ft === "object" ? ft : {};
  return {
    enabled: src.enabled !== false,
    label: String(src.label || "Nội dung cam kết"),
    placeholder: String(src.placeholder || "Viết nội dung cam kết..."),
    required: src.required !== false,
    minLength: Math.max(0, Number(src.minLength) || 0),
  };
}

function normalizeSignature(sig) {
  const src = sig && typeof sig === "object" ? sig : {};
  return {
    enabled: src.enabled !== false,
    required: src.required !== false,
    label: String(src.label || "Chữ ký"),
  };
}

function normalizeSnapshot(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    ten: String(src.ten || "").trim(),
    questions: normalizeQuestions(src.questions),
    freeText: normalizeFreeText(src.freeText),
    signature: normalizeSignature(src.signature),
  };
}

function buildContentText({ snapshot, questionRows, freeTextAnswer, signerName }) {
  const lines = [];
  if (snapshot?.ten) lines.push(`CAM KẾT: ${snapshot.ten}`, "");
  for (const row of questionRows || []) {
    lines.push(`Câu hỏi: ${row.questionText}`);
    if (row.optionsText?.length) {
      lines.push(`Lựa chọn: ${row.optionsText.join(" | ")}`);
    }
    lines.push(`Trả lời: ${row.answerText || ""}`, "");
  }
  if (snapshot?.freeText?.enabled) {
    lines.push(`${snapshot.freeText.label || "Cam kết"}:`, freeTextAnswer || "", "");
  }
  if (snapshot?.signature?.enabled) {
    lines.push(`[Đã ký tay trên màn hình]`);
  }
  if (signerName) {
    lines.push("", `Người cam kết: ${signerName}`);
  }
  return lines.join("\n").trim();
}

function resolveAnswersToText(snapshot, answers) {
  const answerMap = answers && typeof answers === "object" ? answers : {};
  const questionRows = [];
  for (const q of snapshot.questions || []) {
    const raw = answerMap[q.key];
    let selected = [];
    if (Array.isArray(raw)) selected = raw.map(String);
    else if (raw != null && raw !== "") selected = [String(raw)];

    const labels = (q.options || [])
      .filter((o) => selected.includes(String(o.value)) || selected.includes(String(o.label)))
      .map((o) => o.label);

    questionRows.push({
      questionText: q.noiDung,
      optionsText: (q.options || []).map((o) => o.label),
      answerText: labels.length ? labels.join(", ") : selected.join(", "),
    });
  }
  return questionRows;
}

function validateSignPayload(snapshot, body) {
  const answers = body?.answers || {};
  for (const q of snapshot.questions || []) {
    if (!q.required) continue;
    const raw = answers[q.key];
    const empty =
      raw == null ||
      raw === "" ||
      (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      const err = new Error(`Vui lòng trả lời: ${q.noiDung}`);
      err.status = 400;
      throw err;
    }
  }
  const freeTextAnswer = String(body?.freeTextAnswer || "").trim();
  if (snapshot.freeText?.enabled && snapshot.freeText?.required) {
    const min = Number(snapshot.freeText.minLength) || 0;
    if (freeTextAnswer.length < Math.max(min, 1)) {
      const err = new Error(
        min > 0
          ? `Nội dung cam kết cần ít nhất ${min} ký tự`
          : "Vui lòng nhập nội dung cam kết"
      );
      err.status = 400;
      throw err;
    }
  }
  const signatureImage = String(body?.signatureImage || "");
  if (snapshot.signature?.enabled && snapshot.signature?.required) {
    if (!signatureImage.startsWith("data:image/")) {
      const err = new Error("Vui lòng ký tay trên ô chữ ký");
      err.status = 400;
      throw err;
    }
  }
  if (signatureImage && signatureImage.length > MAX_SIGNATURE_CHARS) {
    const err = new Error("Ảnh chữ ký quá lớn — hãy ký lại gọn hơn");
    err.status = 400;
    throw err;
  }
  return { answers, freeTextAnswer, signatureImage };
}

function getExamSecretKey(req) {
  return (
    req.headers["x-exam-key"] ||
    req.query?.secretKey ||
    req.body?.secretKey ||
    ""
  );
}

module.exports = {
  normalizeSnapshot,

  // ---------- Templates ----------
  listTemplates: async (req, res) => {
    try {
      const { active } = req.query;
      const filter = {};
      if (active === "1" || active === "true") filter.active = true;
      const items = await CamKetTemplates.find(filter)
        .sort({ updatedAt: -1 })
        .lean();
      res.status(200).json({ items });
    } catch (error) {
      console.log("camKet.listTemplates:", error.message);
      res.status(500).json({ message: "Không lấy được danh sách mẫu cam kết" });
    }
  },

  getTemplate: async (req, res) => {
    try {
      const item = await CamKetTemplates.findById(req.params.id).lean();
      if (!item) return res.status(404).json({ message: "Không tìm thấy mẫu" });
      res.status(200).json({ item });
    } catch (error) {
      res.status(500).json({ message: "Không lấy được mẫu cam kết" });
    }
  },

  createTemplate: async (req, res) => {
    try {
      const body = req.body || {};
      const ten = String(body.ten || "").trim();
      if (!ten) return res.status(400).json({ message: "Tên mẫu bắt buộc" });
      const item = await CamKetTemplates.create({
        ten,
        mota: String(body.mota || "").trim(),
        active: body.active !== false,
        questions: normalizeQuestions(body.questions),
        freeText: normalizeFreeText(body.freeText),
        signature: normalizeSignature(body.signature),
        createdBy: req.user?._id || null,
      });
      res.status(200).json({ status: "success", item });
    } catch (error) {
      console.log("camKet.createTemplate:", error.message);
      res.status(500).json({ message: "Không tạo được mẫu cam kết" });
    }
  },

  updateTemplate: async (req, res) => {
    try {
      const body = req.body || {};
      const $set = {};
      if (body.ten !== undefined) $set.ten = String(body.ten || "").trim();
      if (body.mota !== undefined) $set.mota = String(body.mota || "").trim();
      if (body.active !== undefined) $set.active = !!body.active;
      if (body.questions !== undefined) $set.questions = normalizeQuestions(body.questions);
      if (body.freeText !== undefined) $set.freeText = normalizeFreeText(body.freeText);
      if (body.signature !== undefined) $set.signature = normalizeSignature(body.signature);
      if ($set.ten === "") return res.status(400).json({ message: "Tên mẫu bắt buộc" });

      const item = await CamKetTemplates.findByIdAndUpdate(
        req.params.id,
        { $set },
        { new: true }
      );
      if (!item) return res.status(404).json({ message: "Không tìm thấy mẫu" });
      res.status(200).json({ status: "success", item });
    } catch (error) {
      console.log("camKet.updateTemplate:", error.message);
      res.status(500).json({ message: "Không cập nhật được mẫu" });
    }
  },

  deleteTemplate: async (req, res) => {
    try {
      const item = await CamKetTemplates.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ message: "Không tìm thấy mẫu" });
      res.status(200).json({ status: "success" });
    } catch (error) {
      res.status(500).json({ message: "Không xóa được mẫu" });
    }
  },

  // ---------- Public: trạng thái + ký ----------
  getCamKetForBaithi: async (req, res) => {
    try {
      const secretKey = getExamSecretKey(req);
      const baithi = await LichsuThis.findById(req.params.id).lean();
      if (!baithi) return res.status(404).json({ message: "Không tìm thấy bài thi" });
      if (!secretKey || String(secretKey) !== String(baithi.secretKey)) {
        return res.status(403).json({ message: "Không có quyền xem bài thi này" });
      }
      if (!baithi.thoigiannopbai) {
        return res.status(400).json({ message: "Chưa nộp bài — chưa thể ký cam kết" });
      }
      const cuocthi = await Cuocthis.findById(baithi.id_cuocthi)
        .select("tencuocthi camKet")
        .lean();
      const enabled = !!cuocthi?.camKet?.enabled;
      const snapshot = enabled
        ? normalizeSnapshot(cuocthi.camKet?.snapshot)
        : null;
      const signed = !!baithi.camKet?.signedAt;
      res.status(200).json({
        enabled,
        signed,
        snapshot,
        camKet: signed
          ? {
              signedAt: baithi.camKet.signedAt,
              contentText: baithi.camKet.contentText || "",
              questions: baithi.camKet.questions || [],
              freeTextLabel: baithi.camKet.freeTextLabel || "",
              freeTextAnswer: baithi.camKet.freeTextAnswer || "",
              signatureImage: baithi.camKet.signatureImage || "",
              signerName: baithi.camKet.signerName || "",
            }
          : null,
        tencuocthi: cuocthi?.tencuocthi || "",
      });
    } catch (error) {
      console.log("camKet.getCamKetForBaithi:", error.message);
      res.status(500).json({ message: "Không lấy được thông tin cam kết" });
    }
  },

  signCamKet: async (req, res) => {
    try {
      const secretKey = getExamSecretKey(req);
      const baithi = await LichsuThis.findById(req.params.id);
      if (!baithi) return res.status(404).json({ message: "Không tìm thấy bài thi" });
      if (!secretKey || String(secretKey) !== String(baithi.secretKey)) {
        return res.status(403).json({ message: "Không có quyền ký bài thi này" });
      }
      if (!baithi.thoigiannopbai) {
        return res.status(400).json({ message: "Chưa nộp bài — chưa thể ký cam kết" });
      }
      if (baithi.camKet?.signedAt) {
        return res.status(400).json({ message: "Bài thi này đã ký cam kết rồi" });
      }

      const cuocthi = await Cuocthis.findById(baithi.id_cuocthi).select("camKet").lean();
      if (!cuocthi?.camKet?.enabled) {
        return res.status(400).json({ message: "Cuộc đánh giá không bật ký cam kết" });
      }
      const snapshot = normalizeSnapshot(cuocthi.camKet.snapshot);
      if (!snapshot.questions.length && !snapshot.freeText?.enabled && !snapshot.signature?.enabled) {
        return res.status(400).json({ message: "Cuộc đánh giá chưa cấu hình nội dung cam kết" });
      }

      const { answers, freeTextAnswer, signatureImage } = validateSignPayload(
        snapshot,
        req.body || {}
      );
      const questionRows = resolveAnswersToText(snapshot, answers);
      const signerName = decryptName(baithi.thongtinthisinh?.name);
      const contentText = buildContentText({
        snapshot,
        questionRows,
        freeTextAnswer,
        signerName,
      });

      baithi.camKet = {
        signedAt: new Date(),
        contentText,
        questions: questionRows,
        freeTextLabel: snapshot.freeText?.enabled ? snapshot.freeText.label : "",
        freeTextAnswer: snapshot.freeText?.enabled ? freeTextAnswer : "",
        signatureImage:
          snapshot.signature?.enabled && signatureImage ? signatureImage : "",
        signatureRequired: !!snapshot.signature?.required,
        signerName: signerName || "",
      };
      baithi.markModified("camKet");
      await baithi.save();

      res.status(200).json({
        status: "success",
        camKet: {
          signedAt: baithi.camKet.signedAt,
          contentText: baithi.camKet.contentText,
          questions: baithi.camKet.questions,
          freeTextLabel: baithi.camKet.freeTextLabel,
          freeTextAnswer: baithi.camKet.freeTextAnswer,
          signatureImage: baithi.camKet.signatureImage,
          signerName: baithi.camKet.signerName || "",
        },
      });
    } catch (error) {
      console.log("camKet.signCamKet:", error.message);
      res.status(error.status || 500).json({
        message: error.status ? error.message : "Không ký được cam kết",
      });
    }
  },

  /** Admin xem chi tiết cam kết 1 bài thi */
  getCamKetAdmin: async (req, res) => {
    try {
      const baithi = await LichsuThis.findById(req.params.id)
        .select("id_cuocthi camKet thongtinthisinh socaudung")
        .lean();
      if (!baithi) return res.status(404).json({ message: "Không tìm thấy bài thi" });
      const cuocthi = await Cuocthis.findById(baithi.id_cuocthi)
        .select("createdBy monthi tencuocthi")
        .lean();
      assertCanAccessCuocthi(req.user, cuocthi);
      res.status(200).json({
        tencuocthi: cuocthi?.tencuocthi || "",
        camKet: baithi.camKet || null,
        baithiId: baithi._id,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.status ? error.message : "Không lấy được cam kết",
      });
    }
  },
};
