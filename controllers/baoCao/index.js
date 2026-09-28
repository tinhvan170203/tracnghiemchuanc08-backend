/**
 * MODULE BÁO CÁO — Controller gộp (template / kỳ / phiếu / thông báo / tổng hợp số).
 * File: backend/controllers/baoCao/index.js
 * Tách hoàn toàn khỏi controllers/monthi — không import cuocthiAccess.
 */
const ReportTemplates = require("../../models/baoCao/ReportTemplate");
const ReportPeriods = require("../../models/baoCao/ReportPeriod");
const ReportSubmissions = require("../../models/baoCao/ReportSubmission");
const BaoCaoNotifications = require("../../models/baoCao/Notification");
const Users = require("../../models/User");
const { buildBmLaiXeMoToTemplate } = require("../../models/baoCao/seedBmTemplate");
const {
  buildBaoCaoOwnerFilter,
  assertCanManageTemplate,
  assertCanManagePeriod,
  assertCanReadPeriod,
} = require("../../utils/baoCaoAccess");
const {
  assertSameTemplate,
  buildValuesByUser,
  buildCompareRows,
  numberFieldKeysFromSnapshot,
} = require("../../utils/baoCaoCompare");

/** Tên hiển thị ưu tiên tenHienThi → tenDonVi → tentaikhoan */
function accountDisplayName(...sources) {
  for (const s of sources) {
    if (!s) continue;
    if (typeof s === "string" && s.trim()) return s.trim();
    const name = String(s.tenHienThi || s.tenDonVi || s.tentaikhoan || "").trim();
    if (name) return name;
  }
  return "";
}

/** Tạo thông báo in-app cho danh sách user (vd. khi mở kỳ). */
async function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return;
  await BaoCaoNotifications.insertMany(
    ids.map((userId) => ({
      userId,
      title: payload.title,
      body: payload.body || "",
      link: payload.link || "",
      type: payload.type || "bao_cao_moi",
    }))
  );
}

function snapshotFromTemplate(template) {
  return {
    ten: template.ten,
    version: template.version,
    coHangTongCong: template.coHangTongCong !== false,
    metaFields: template.metaFields,
    sections: template.sections,
    summaryItems: template.summaryItems,
  };
}

/** Đếm số kỳ đang gắn template — dùng để khóa sửa/xóa và gắn cờ usedByPeriods. */
async function countPeriodsUsingTemplate(templateId) {
  return ReportPeriods.countDocuments({ templateId });
}

/** Ngưỡng “sắp đến hạn” (ngày) — đồng bộ frontend/deadlineUtils.js */
const SOON_DAYS = 7;

function toLocalDateOnly(value) {
  if (!value) return null;
  const s = String(value).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function daysUntilDenNgay(denNgay) {
  const end = toLocalDateOnly(denNgay);
  if (!end) return null;
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((end - today) / 86400000);
}

function deadlineLevelFromDenNgay(denNgay) {
  const d = daysUntilDenNgay(denNgay);
  if (d == null) return "none";
  if (d < 0) return "overdue";
  if (d === 0) return "due";
  if (d <= SOON_DAYS) return "soon";
  return "long";
}

function buildPeriodProgress(period, submittedCount = 0) {
  const totalAssignees = (period.assignees || []).length;
  const submitted = Math.min(Number(submittedCount) || 0, totalAssignees);
  const incomplete = Math.max(0, totalAssignees - submitted);
  return {
    totalAssignees,
    submitted,
    incomplete,
    deadlineLevel: deadlineLevelFromDenNgay(period.denNgay),
    daysLeft: daysUntilDenNgay(period.denNgay),
  };
}

/** Chuẩn hóa + kiểm tra tối thiểu trước khi create/update. */
function normalizeTemplatePayload(body) {
  const ten = String(body?.ten || "").trim();
  if (!ten) {
    const err = new Error("Tên biểu mẫu bắt buộc");
    err.status = 400;
    throw err;
  }
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const sectionKeys = new Set();
  const fieldKeys = new Set();
  for (const s of sections) {
    const sk = String(s.key || "").trim();
    if (!sk) {
      const err = new Error("Mỗi biểu (section) cần có key");
      err.status = 400;
      throw err;
    }
    if (sectionKeys.has(sk)) {
      const err = new Error(`Trùng key biểu: ${sk}`);
      err.status = 400;
      throw err;
    }
    sectionKeys.add(sk);
    for (const f of s.fields || []) {
      const fk = String(f.key || "").trim();
      if (!fk) {
        const err = new Error(`Field trong biểu "${s.title || sk}" thiếu key`);
        err.status = 400;
        throw err;
      }
      if (fieldKeys.has(fk)) {
        const err = new Error(`Trùng key chỉ tiêu: ${fk}`);
        err.status = 400;
        throw err;
      }
      fieldKeys.add(fk);
    }
  }
  return {
    ten,
    mota: body.mota || "",
    coHangTongCong: body.coHangTongCong !== false && body.coHangTongCong !== "false",
    metaFields: Array.isArray(body.metaFields) ? body.metaFields : [],
    sections,
    summaryItems: Array.isArray(body.summaryItems) ? body.summaryItems : [],
  };
}

/** Cộng các field aggregatable (number/boolean) từ submission đã nộp. Text/date bỏ qua. */
function sumAggregatable(schemaSnapshot, submissions) {
  const totals = {};
  const sections = schemaSnapshot?.sections || [];
  for (const section of sections) {
    for (const field of section.fields || []) {
      if (!field.aggregatable) continue;
      if (field.dataType !== "number" && field.dataType !== "boolean") continue;
      let sum = 0;
      for (const sub of submissions) {
        if (sub.status !== "submitted") continue;
        const raw = sub.values?.[field.key];
        const n = Number(raw);
        if (!Number.isNaN(n)) sum += n;
      }
      totals[field.key] = sum;
    }
  }
  return totals;
}

/**
 * Evaluate công thức an toàn trên map totals[key].
 * Chỉ cho phép: identifier (a-z0-9_), số, + - * / ( ) và khoảng trắng.
 */
function evalSummaryFormula(formula, totals) {
  const src = String(formula || "").trim();
  if (!src) return null;
  if (!/^[a-zA-Z0-9_\s+\-*/().]+$/.test(src)) {
    throw new Error("Công thức chứa ký tự không hợp lệ");
  }
  const keys = Object.keys(totals || {}).sort((a, b) => b.length - a.length);
  let expr = src;
  for (const key of keys) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
    const re = new RegExp(`\\b${key}\\b`, "g");
    expr = expr.replace(re, String(Number(totals[key]) || 0));
  }
  // Còn identifier chưa thay → coi là 0 (key không SUM / không tồn tại)
  expr = expr.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, "0");
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    throw new Error("Không evaluate được công thức");
  }
  // eslint-disable-next-line no-new-func
  const val = Function(`"use strict"; return (${expr});`)();
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return val;
}

/** Build mảng summary từ schemaSnapshot.summaryItems + totals đã SUM. */
function buildSummaryRows(schemaSnapshot, totals) {
  const items = schemaSnapshot?.summaryItems || [];
  return items
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item) => {
      const mode = item.mode || (item.formula ? "formula" : "field");
      let value = null;
      let error = null;
      try {
        if (mode === "formula") {
          value = evalSummaryFormula(item.formula, totals);
        } else {
          const k = item.sourceFieldKey;
          value = k != null && k !== "" ? Number(totals[k] ?? 0) : null;
        }
      } catch (e) {
        error = e.message;
        value = null;
      }
      return {
        label: item.label,
        mode,
        sourceFieldKey: item.sourceFieldKey || "",
        formula: item.formula || "",
        unit: item.unit || "",
        value,
        error,
      };
    });
}

module.exports = {
  // ========== TEMPLATES ==========
  listTemplates: async (req, res) => {
    try {
      // Chỉ lấy meta nhẹ — không trả sections/fields (BM có thể rất nặng → FE lag).
      const access = buildBaoCaoOwnerFilter(req.user);
      const items = await ReportTemplates.find(access)
        .select("ten mota version nguon updatedAt createdAt createdBy")
        .populate("createdBy", "tentaikhoan tenHienThi")
        .sort({ updatedAt: -1 })
        .lean();
      const ids = items.map((i) => i._id);
      const sectionCounts = ids.length
        ? await ReportTemplates.aggregate([
            { $match: { _id: { $in: ids } } },
            { $project: { n: { $size: { $ifNull: ["$sections", []] } } } },
          ])
        : [];
      const sectionMap = {};
      for (const c of sectionCounts) sectionMap[String(c._id)] = c.n;
      const counts = ids.length
        ? await ReportPeriods.aggregate([
            { $match: { templateId: { $in: ids } } },
            { $group: { _id: "$templateId", n: { $sum: 1 } } },
          ])
        : [];
      const usedMap = {};
      for (const c of counts) {
        if (c._id) usedMap[String(c._id)] = c.n;
      }
      const withFlags = items.map((item) => ({
        ...item,
        sectionCount: sectionMap[String(item._id)] || 0,
        usedByPeriods: usedMap[String(item._id)] || 0,
      }));
      res.status(200).json({ items: withFlags });
    } catch (error) {
      console.log("baoCao.listTemplates:", error.message);
      res.status(500).json({ message: "Không lấy được danh sách biểu mẫu" });
    }
  },

  getTemplate: async (req, res) => {
    try {
      const item = await ReportTemplates.findById(req.params.id).lean();
      if (!item) return res.status(404).json({ message: "Không tìm thấy biểu mẫu" });
      assertCanManageTemplate(req.user, item);
      const usedByPeriods = await countPeriodsUsingTemplate(req.params.id);
      res.status(200).json({ item: { ...item, usedByPeriods } });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.message || "Không lấy được biểu mẫu",
      });
    }
  },

  createTemplate: async (req, res) => {
    try {
      const payload = normalizeTemplatePayload(req.body || {});
      const item = await ReportTemplates.create({
        ...payload,
        version: 1,
        nguon: "local",
        createdBy: req.user?._id || null,
      });
      res.status(200).json({ status: "success", item });
    } catch (error) {
      console.log("baoCao.createTemplate:", error.message);
      res.status(error.status || 500).json({ message: error.message || "Không tạo được biểu mẫu" });
    }
  },

  updateTemplate: async (req, res) => {
    try {
      const existing = await ReportTemplates.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ message: "Không tìm thấy biểu mẫu" });
      assertCanManageTemplate(req.user, existing);

      const used = await countPeriodsUsingTemplate(req.params.id);
      if (used > 0) {
        return res.status(400).json({
          message:
            "Biểu mẫu đã được dùng bởi kỳ báo cáo — không sửa được. Hãy nhân bản để chỉnh.",
        });
      }
      const payload = normalizeTemplatePayload(req.body || {});
      const body = req.body || {};
      const item = await ReportTemplates.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            ...payload,
            version: (body.version || 1) + (body.bumpVersion ? 1 : 0),
          },
        },
        { new: true }
      );
      if (!item) return res.status(404).json({ message: "Không tìm thấy biểu mẫu" });
      res.status(200).json({ status: "success", item });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.message || "Không cập nhật được biểu mẫu",
      });
    }
  },

  /** Nhân bản mẫu — dùng khi mẫu gốc đã gắn kỳ (không sửa được). */
  cloneTemplate: async (req, res) => {
    try {
      const src = await ReportTemplates.findById(req.params.id).lean();
      if (!src) return res.status(404).json({ message: "Không tìm thấy biểu mẫu" });
      assertCanManageTemplate(req.user, src);
      const item = await ReportTemplates.create({
        ten: `${src.ten} (bản sao)`,
        mota: src.mota || "",
        version: 1,
        nguon: "local",
        c08Id: null,
        coHangTongCong: src.coHangTongCong !== false,
        metaFields: src.metaFields || [],
        sections: src.sections || [],
        summaryItems: src.summaryItems || [],
        createdBy: req.user?._id || null,
      });
      res.status(200).json({
        status: "success",
        item: { ...item.toObject(), usedByPeriods: 0 },
      });
    } catch (error) {
      console.log("baoCao.cloneTemplate:", error.message);
      res.status(error.status || 500).json({
        message: error.message || "Không nhân bản được biểu mẫu",
      });
    }
  },

  deleteTemplate: async (req, res) => {
    try {
      const existing = await ReportTemplates.findById(req.params.id).lean();
      if (!existing) return res.status(404).json({ message: "Không tìm thấy biểu mẫu" });
      assertCanManageTemplate(req.user, existing);

      const used = await countPeriodsUsingTemplate(req.params.id);
      if (used > 0) {
        return res.status(400).json({
          message: "Biểu mẫu đang được dùng bởi kỳ báo cáo — không xóa được",
        });
      }
      await ReportTemplates.findByIdAndDelete(req.params.id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.message || "Không xóa được biểu mẫu",
      });
    }
  },

  seedBmTemplate: async (req, res) => {
    try {
      const data = buildBmLaiXeMoToTemplate();
      const item = await ReportTemplates.create({
        ...data,
        createdBy: req.user?._id || null,
      });
      res.status(200).json({ status: "success", item });
    } catch (error) {
      console.log("baoCao.seedBmTemplate:", error.message);
      res.status(500).json({ message: "Không seed được biểu mẫu BM" });
    }
  },

  // ========== KỲ BÁO CÁO ==========
  listPeriods: async (req, res) => {
    try {
      const { status, fromDate, toDate, templateId } = req.query;
      const filter = { ...buildBaoCaoOwnerFilter(req.user) };
      if (status) filter.status = status;
      if (templateId) filter.templateId = templateId;
      if (fromDate || toDate) {
        filter.$and = filter.$and || [];
        if (fromDate) filter.$and.push({ denNgay: { $gte: fromDate } });
        if (toDate) filter.$and.push({ tuNgay: { $lte: toDate } });
      }
      const items = await ReportPeriods.find(filter)
        .populate("templateId", "ten version")
        .populate("createdBy", "tentaikhoan tenHienThi")
        .sort({ updatedAt: -1 })
        .lean();

      const periodIds = items.map((p) => p._id);
      const submittedByPeriod = new Map();
      if (periodIds.length) {
        const agg = await ReportSubmissions.aggregate([
          {
            $match: {
              periodId: { $in: periodIds },
              status: "submitted",
            },
          },
          { $group: { _id: "$periodId", count: { $sum: 1 } } },
        ]);
        for (const row of agg) {
          submittedByPeriod.set(String(row._id), row.count);
        }
      }

      const withProgress = items.map((p) => ({
        ...p,
        progress: buildPeriodProgress(p, submittedByPeriod.get(String(p._id)) || 0),
      }));

      res.status(200).json({ items: withProgress });
    } catch (error) {
      res.status(500).json({ message: "Không lấy được danh sách kỳ báo cáo" });
    }
  },

  getPeriod: async (req, res) => {
    try {
      const item = await ReportPeriods.findById(req.params.id)
        .populate("templateId", "ten version")
        .lean();
      if (!item) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanReadPeriod(req.user, item);
      res.status(200).json({ item });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.message || "Không lấy được kỳ báo cáo",
      });
    }
  },

  createPeriod: async (req, res) => {
    try {
      const body = req.body || {};
      const template = await ReportTemplates.findById(body.templateId).lean();
      if (!template) {
        return res.status(404).json({ message: "Không tìm thấy biểu mẫu" });
      }
      assertCanManageTemplate(req.user, template);
      const item = await ReportPeriods.create({
        templateId: template._id,
        tenKy: body.tenKy,
        tuNgay: body.tuNgay || "",
        denNgay: body.denNgay || "",
        loaiBaoCao: body.loaiBaoCao || "Tháng",
        status: body.status || "draft",
        nguon: "local",
        metaValues: body.metaValues || {},
        assignees: body.assignees || [],
        schemaSnapshot: snapshotFromTemplate(template),
        createdBy: req.user?._id || null,
      });
      res.status(200).json({ status: "success", item });
    } catch (error) {
      console.log("baoCao.createPeriod:", error.message);
      res.status(error.status || 500).json({
        message: error.message || "Không tạo được kỳ báo cáo",
      });
    }
  },

  updatePeriod: async (req, res) => {
    try {
      const body = req.body || {};
      const allowed = [
        "tenKy",
        "tuNgay",
        "denNgay",
        "loaiBaoCao",
        "metaValues",
        "assignees",
        "status",
      ];
      const prev = await ReportPeriods.findById(req.params.id).lean();
      if (!prev) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanManagePeriod(req.user, prev);

      const $set = {};
      for (const k of allowed) {
        if (body[k] !== undefined) $set[k] = body[k];
      }
      const item = await ReportPeriods.findByIdAndUpdate(
        req.params.id,
        { $set },
        { new: true }
      );

      // Kỳ đang mở + bổ sung assignee → thông báo user mới
      if (
        body.assignees &&
        Array.isArray(body.assignees) &&
        (item.status === "open" || prev.status === "open")
      ) {
        const oldIds = new Set(
          (prev.assignees || [])
            .map((a) => (a.userId ? String(a.userId) : null))
            .filter(Boolean)
        );
        const newIds = (body.assignees || [])
          .map((a) => (a.userId ? String(a.userId) : null))
          .filter((id) => id && !oldIds.has(id));
        if (newIds.length) {
          await notifyUsers(newIds, {
            title: `Bạn được giao kỳ báo cáo: ${item.tenKy}`,
            body: `Kỳ báo cáo từ ${item.tuNgay || "…"} đến ${item.denNgay || "…"} đang diễn ra. Vui lòng nhập và nộp báo cáo.`,
            link: `/admin/bao-cao/cua-toi`,
            type: "bao_cao_moi",
          });
        }
      }

      res.status(200).json({ status: "success", item });
    } catch (error) {
      console.log("baoCao.updatePeriod:", error.message);
      res.status(error.status || 500).json({
        message: error.message || "Không cập nhật được kỳ báo cáo",
      });
    }
  },

  openPeriod: async (req, res) => {
    try {
      const item = await ReportPeriods.findById(req.params.id);
      if (!item) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanManagePeriod(req.user, item);
      if (item.status === "open") {
        return res.status(400).json({ message: "Kỳ báo cáo đang mở rồi" });
      }

      const wasClosed = item.status === "closed";
      item.status = "open";
      // Đảm bảo có snapshot trước khi đơn vị bắt đầu nhập
      if (!item.schemaSnapshot && item.templateId) {
        const template = await ReportTemplates.findById(item.templateId);
        if (template) item.schemaSnapshot = snapshotFromTemplate(template);
      }
      await item.save();

      // Thông báo tới mọi assignee có userId
      const userIds = (item.assignees || [])
        .map((a) => a.userId)
        .filter(Boolean);
      await notifyUsers(userIds, {
        title: wasClosed
          ? `Kỳ báo cáo đã mở lại: ${item.tenKy}`
          : `Kỳ báo cáo mới: ${item.tenKy}`,
        body: wasClosed
          ? `Kỳ báo cáo từ ${item.tuNgay || "…"} đến ${item.denNgay || "…"} đã được mở lại. Bạn có thể tiếp tục nhập / nộp.`
          : `Kỳ báo cáo từ ${item.tuNgay || "…"} đến ${item.denNgay || "…"} đã mở. Vui lòng nhập và nộp báo cáo.`,
        link: `/admin/bao-cao/cua-toi`,
        type: "bao_cao_moi",
      });

      res.status(200).json({ status: "success", item, reopened: wasClosed });
    } catch (error) {
      console.log("baoCao.openPeriod:", error.message);
      res.status(error.status || 500).json({
        message: error.message || "Không mở được kỳ báo cáo",
      });
    }
  },

  closePeriod: async (req, res) => {
    try {
      const prev = await ReportPeriods.findById(req.params.id).lean();
      if (!prev) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanManagePeriod(req.user, prev);
      const item = await ReportPeriods.findByIdAndUpdate(
        req.params.id,
        { $set: { status: "closed" } },
        { new: true }
      );
      res.status(200).json({ status: "success", item });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.message || "Không đóng được kỳ báo cáo",
      });
    }
  },

  deletePeriod: async (req, res) => {
    try {
      const period = await ReportPeriods.findById(req.params.id);
      if (!period) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanManagePeriod(req.user, period);
      // Chỉ xóa nháp hoặc đã đóng — không xóa kỳ đang mở.
      if (period.status === "open") {
        return res.status(400).json({
          message: "Kỳ đang mở — hãy đóng kỳ trước, hoặc chỉ xóa kỳ ở trạng thái nháp",
        });
      }
      await ReportSubmissions.deleteMany({ periodId: period._id });
      await ReportPeriods.findByIdAndDelete(period._id);
      res.status(200).json({ status: "success" });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.message || "Không xóa được kỳ báo cáo",
      });
    }
  },

  // ========== PHIẾU NỘP / TRẠNG THÁI ==========
  listSubmissionsByPeriod: async (req, res) => {
    try {
      const period = await ReportPeriods.findById(req.params.periodId).lean();
      if (!period) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanManagePeriod(req.user, period);

      const includeValues =
        req.query.includeValues === "1" ||
        req.query.includeValues === "true" ||
        req.query.includeValues === true;

      const submissions = await ReportSubmissions.find({ periodId: period._id })
        .populate("userId", "tentaikhoan tenHienThi")
        .lean();

      const byUser = new Map(
        submissions.map((s) => [String(s.userId?._id || s.userId), s])
      );

      const assigneeIds = (period.assignees || [])
        .map((a) => a.userId)
        .filter(Boolean);
      const userDocs = await Users.find({ _id: { $in: assigneeIds } })
        .select("tentaikhoan tenHienThi")
        .lean();
      const userMap = new Map(userDocs.map((u) => [String(u._id), u]));

      const rows = (period.assignees || []).map((a) => {
        const uid = a.userId ? String(a.userId._id || a.userId) : null;
        const sub = uid ? byUser.get(uid) : null;
        const user = uid ? userMap.get(uid) : null;
        const tenHienThi = user?.tenHienThi || "";
        const tentaikhoan = user?.tentaikhoan || "";
        const tenDonVi = accountDisplayName(user, a, sub, tentaikhoan);
        const row = {
          userId: a.userId,
          tenDonVi,
          tenHienThi,
          tentaikhoan,
          loaiDonVi: a.loaiDonVi || "",
          status: sub?.status || "chua_lam",
          submittedAt: sub?.submittedAt || null,
          sectionDone: sub?.sectionDone && typeof sub.sectionDone === "object" ? sub.sectionDone : {},
          submissionId: sub?._id || null,
          updatedAt: sub?.updatedAt || null,
        };
        if (includeValues) {
          row.values = sub?.values || {};
          row.metaValues = sub?.metaValues || {};
        }
        return row;
      });

      const sectionsFull = (period.schemaSnapshot?.sections || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      const sections = sectionsFull.map((s) => ({
        key: s.key,
        title: s.title || s.key,
        order: s.order || 0,
        sheetName: s.sheetName || "",
        groups: s.groups || [],
        fields: s.fields || [],
      }));

      res.status(200).json({
        period,
        sections,
        rows,
        totals: sumAggregatable(
          period.schemaSnapshot,
          submissions.filter((s) => s.status === "submitted")
        ),
        /** Mọi phiếu theo userId (kể cả đã gỡ khỏi assignees) — dùng khi sửa gán TK */
        submissionStatuses: Object.fromEntries(
          submissions
            .map((s) => {
              const uid = s.userId ? String(s.userId._id || s.userId) : null;
              return uid ? [uid, s.status || "draft"] : null;
            })
            .filter(Boolean)
        ),
      });
    } catch (error) {
      console.log("baoCao.listSubmissionsByPeriod:", error.message);
      res.status(error.status || 500).json({
        message: error.message || "Không lấy được trạng thái nộp",
      });
    }
  },

  /** Admin xem chi tiết phiếu 1 đơn vị trong kỳ (kèm values đầy đủ). */
  getSubmissionByUser: async (req, res) => {
    try {
      const period = await ReportPeriods.findById(req.params.periodId).lean();
      if (!period) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanManagePeriod(req.user, period);

      const userId = req.params.userId;
      const assignee = (period.assignees || []).find(
        (a) => a.userId && String(a.userId) === String(userId)
      );
      if (!assignee) {
        return res.status(404).json({ message: "Đơn vị không thuộc kỳ báo cáo này" });
      }

      let submission = await ReportSubmissions.findOne({
        periodId: period._id,
        userId,
      })
        .populate("userId", "tentaikhoan tenHienThi")
        .lean();

      const userDoc = await Users.findById(userId).select("tentaikhoan tenHienThi").lean();
      const tenDonVi = accountDisplayName(
        userDoc,
        assignee,
        submission,
        userDoc?.tentaikhoan
      );

      if (!submission) {
        submission = {
          periodId: period._id,
          userId,
          tenDonVi,
          values: {},
          metaValues: {},
          sectionDone: {},
          status: "chua_lam",
          submittedAt: null,
        };
      } else if (!submission.tenDonVi || submission.tenDonVi === submission.userId?.tentaikhoan) {
        submission = { ...submission, tenDonVi };
      }

      const sections = (period.schemaSnapshot?.sections || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      res.status(200).json({
        period,
        assignee: {
          ...assignee,
          tenDonVi,
          tenHienThi: userDoc?.tenHienThi || "",
          tentaikhoan: userDoc?.tentaikhoan || "",
        },
        submission,
        sections,
        metaFields: period.schemaSnapshot?.metaFields || [],
      });
    } catch (error) {
      console.log("baoCao.getSubmissionByUser:", error.message);
      res.status(error.status || 500).json({
        message: error.message || "Không lấy được chi tiết báo cáo",
      });
    }
  },

  listMyAssignments: async (req, res) => {
    try {
      const userId = req.user._id;
      const periods = await ReportPeriods.find({
        status: { $in: ["open", "closed"] },
        "assignees.userId": userId,
      })
        .sort({ updatedAt: -1 })
        .lean();

      const periodIds = periods.map((p) => p._id);
      const subs = await ReportSubmissions.find({
        periodId: { $in: periodIds },
        userId,
      }).lean();
      const subMap = new Map(subs.map((s) => [String(s.periodId), s]));

      const items = periods.map((p) => ({
        period: p,
        submission: subMap.get(String(p._id)) || null,
      }));
      res.status(200).json({ items });
    } catch (error) {
      res.status(500).json({ message: "Không lấy được báo cáo của tôi" });
    }
  },

  getMySubmission: async (req, res) => {
    try {
      const period = await ReportPeriods.findById(req.params.periodId).lean();
      if (!period) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });

      const assigned = (period.assignees || []).some(
        (a) => a.userId && String(a.userId) === String(req.user._id)
      );
      const isAdmin = (req.user.roles || []).some((r) =>
        ["xem trạng thái nộp báo cáo", "cấu hình biểu mẫu báo cáo", "sửa báo cáo"].includes(r)
      );
      if (!assigned && !isAdmin) {
        return res.status(403).json({ message: "Bạn không được giao kỳ báo cáo này" });
      }

      let submission = await ReportSubmissions.findOne({
        periodId: period._id,
        userId: req.user._id,
      }).lean();

      if (!submission && assigned) {
        const assignee = (period.assignees || []).find(
          (a) => a.userId && String(a.userId) === String(req.user._id)
        );
        submission = await ReportSubmissions.create({
          periodId: period._id,
          userId: req.user._id,
          tenDonVi: accountDisplayName(
            req.user,
            assignee,
            req.user?.tenHienThi,
            req.user?.tentaikhoan
          ),
          values: {},
          metaValues: {},
          sectionDone: {},
          status: "draft",
        });
        submission = submission.toObject();
      }

      res.status(200).json({ period, submission });
    } catch (error) {
      console.log("baoCao.getMySubmission:", error.message);
      res.status(500).json({ message: "Không lấy được phiếu báo cáo" });
    }
  },

  saveMySubmission: async (req, res) => {
    try {
      const period = await ReportPeriods.findById(req.params.periodId);
      if (!period) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      if (period.status !== "open") {
        return res.status(400).json({ message: "Kỳ báo cáo không còn mở để nhập" });
      }

      const assigned = (period.assignees || []).some(
        (a) => a.userId && String(a.userId) === String(req.user._id)
      );
      if (!assigned) {
        return res.status(403).json({ message: "Bạn không được giao kỳ báo cáo này" });
      }

      const body = req.body || {};
      const assignee = (period.assignees || []).find(
        (a) => a.userId && String(a.userId) === String(req.user._id)
      );

      let submission = await ReportSubmissions.findOne({
        periodId: period._id,
        userId: req.user._id,
      });

      if (!submission) {
        submission = new ReportSubmissions({
          periodId: period._id,
          userId: req.user._id,
          tenDonVi: accountDisplayName(
            req.user,
            assignee,
            req.user?.tenHienThi,
            req.user?.tentaikhoan
          ),
        });
      }

      if (submission.status === "submitted" && !body.reopen) {
        return res.status(400).json({ message: "Báo cáo đã nộp — không sửa trực tiếp" });
      }

      if (body.values && typeof body.values === "object") {
        submission.values = { ...(submission.values || {}), ...body.values };
        submission.markModified("values");
      }
      if (body.metaValues && typeof body.metaValues === "object") {
        submission.metaValues = {
          ...(submission.metaValues || {}),
          ...body.metaValues,
        };
        submission.markModified("metaValues");
      }
      if (body.sectionDone && typeof body.sectionDone === "object") {
        submission.sectionDone = {
          ...(submission.sectionDone || {}),
          ...body.sectionDone,
        };
        submission.markModified("sectionDone");
      }
      if (body.tenDonVi) submission.tenDonVi = body.tenDonVi;
      submission.status = "draft";
      submission.submittedAt = null;
      await submission.save();

      res.status(200).json({ status: "success", submission });
    } catch (error) {
      console.log("baoCao.saveMySubmission:", error.message);
      res.status(500).json({ message: "Không lưu được báo cáo" });
    }
  },

  submitMySubmission: async (req, res) => {
    try {
      const period = await ReportPeriods.findById(req.params.periodId);
      if (!period) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      if (period.status !== "open") {
        return res.status(400).json({ message: "Kỳ báo cáo không còn mở để nộp" });
      }

      const assigned = (period.assignees || []).some(
        (a) => a.userId && String(a.userId) === String(req.user._id)
      );
      if (!assigned) {
        return res.status(403).json({ message: "Bạn không được giao kỳ báo cáo này" });
      }

      const submission = await ReportSubmissions.findOne({
        periodId: period._id,
        userId: req.user._id,
      });
      if (!submission) {
        return res.status(400).json({ message: "Chưa có bản nháp để nộp" });
      }

      submission.status = "submitted";
      submission.submittedAt = new Date();
      await submission.save();

      res.status(200).json({ status: "success", submission });
    } catch (error) {
      res.status(500).json({ message: "Không nộp được báo cáo" });
    }
  },

  // ========== THÔNG BÁO ==========
  listMyNotifications: async (req, res) => {
    try {
      const items = await BaoCaoNotifications.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const unread = await BaoCaoNotifications.countDocuments({
        userId: req.user._id,
        read: false,
      });
      res.status(200).json({ items, unread });
    } catch (error) {
      res.status(500).json({ message: "Không lấy được thông báo" });
    }
  },

  markNotificationRead: async (req, res) => {
    try {
      await BaoCaoNotifications.updateOne(
        { _id: req.params.id, userId: req.user._id },
        { $set: { read: true } }
      );
      res.status(200).json({ status: "success" });
    } catch (error) {
      res.status(500).json({ message: "Không cập nhật thông báo" });
    }
  },

  markAllNotificationsRead: async (req, res) => {
    try {
      await BaoCaoNotifications.updateMany(
        { userId: req.user._id, read: false },
        { $set: { read: true } }
      );
      res.status(200).json({ status: "success" });
    } catch (error) {
      res.status(500).json({ message: "Không cập nhật thông báo" });
    }
  },

  // ---------- Helpers for assignees UI ----------
  listUsersForAssignee: async (req, res) => {
    try {
      const users = await Users.find()
        .select("tentaikhoan tenHienThi roles thutu")
        .sort({ thutu: 1 })
        .lean();
      res.status(200).json({
        items: users.map((u) => ({
          _id: u._id,
          tentaikhoan: u.tentaikhoan,
          tenHienThi: u.tenHienThi || "",
          hasNhapBaoCao: (u.roles || []).includes("nhập báo cáo"),
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Không lấy được danh sách tài khoản" });
    }
  },

  aggregatePeriod: async (req, res) => {
    try {
      const period = await ReportPeriods.findById(req.params.periodId).lean();
      if (!period) return res.status(404).json({ message: "Không tìm thấy kỳ báo cáo" });
      assertCanManagePeriod(req.user, period);
      const submissions = await ReportSubmissions.find({
        periodId: period._id,
        status: "submitted",
      }).lean();
      const totals = sumAggregatable(period.schemaSnapshot, submissions);
      const summary = buildSummaryRows(period.schemaSnapshot, totals);
      res.status(200).json({
        period,
        submittedCount: submissions.length,
        assigneeCount: (period.assignees || []).length,
        totals,
        summary,
        submissions,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        message: error.message || "Không tổng hợp được kỳ báo cáo",
      });
    }
  },

  /**
   * So sánh 2 kỳ — bắt buộc cùng templateId.
   * Query: periodA, periodB
   */
  comparePeriods: async (req, res) => {
    try {
      const idA = req.query.periodA || req.query.a;
      const idB = req.query.periodB || req.query.b;
      if (!idA || !idB) {
        return res.status(400).json({
          message: "Thiếu periodA hoặc periodB",
        });
      }
      if (String(idA) === String(idB)) {
        return res.status(400).json({
          message: "Chọn 2 kỳ khác nhau để so sánh",
        });
      }

      const [periodA, periodB] = await Promise.all([
        ReportPeriods.findById(idA)
          .populate("templateId", "ten version")
          .lean(),
        ReportPeriods.findById(idB)
          .populate("templateId", "ten version")
          .lean(),
      ]);
      if (!periodA) return res.status(404).json({ message: "Không tìm thấy kỳ A" });
      if (!periodB) return res.status(404).json({ message: "Không tìm thấy kỳ B" });
      assertCanManagePeriod(req.user, periodA);
      assertCanManagePeriod(req.user, periodB);

      const templateId = assertSameTemplate(periodA, periodB);

      const [subsA, subsB] = await Promise.all([
        ReportSubmissions.find({
          periodId: periodA._id,
          status: { $in: ["submitted", "draft"] },
        })
          .populate("userId", "tentaikhoan tenHienThi")
          .lean(),
        ReportSubmissions.find({
          periodId: periodB._id,
          status: { $in: ["submitted", "draft"] },
        })
          .populate("userId", "tentaikhoan tenHienThi")
          .lean(),
      ]);

      const assigneeIds = [
        ...new Set(
          [...(periodA.assignees || []), ...(periodB.assignees || [])]
            .map((a) => (a.userId ? String(a.userId._id || a.userId) : null))
            .filter(Boolean)
        ),
      ];
      const userDocs = await Users.find({ _id: { $in: assigneeIds } })
        .select("tentaikhoan tenHienThi")
        .lean();
      const umap = new Map(userDocs.map((u) => [String(u._id), u]));

      const patchAssignees = (period) => ({
        ...period,
        assignees: (period.assignees || []).map((a) => {
          const uid = a.userId ? String(a.userId._id || a.userId) : null;
          const u = uid ? umap.get(uid) : null;
          return {
            ...a,
            tenDonVi: accountDisplayName(u, a, u?.tentaikhoan),
            tenHienThi: u?.tenHienThi || "",
          };
        }),
      });
      const patchSubs = (subs) =>
        (subs || []).map((s) => {
          const uid = s.userId ? String(s.userId._id || s.userId) : null;
          const uObj = s.userId && typeof s.userId === "object" ? s.userId : null;
          const u = umap.get(uid) || uObj;
          return {
            ...s,
            tenDonVi: accountDisplayName(u, s.tenDonVi, u?.tentaikhoan),
          };
        });

      const pA = patchAssignees(periodA);
      const pB = patchAssignees(periodB);
      const mapA = buildValuesByUser(pA, patchSubs(subsA));
      const mapB = buildValuesByUser(pB, patchSubs(subsB));

      const snapshot = periodA.schemaSnapshot || periodB.schemaSnapshot || {};
      const numKeys = numberFieldKeysFromSnapshot(snapshot);
      const rows = buildCompareRows(mapA, mapB, numKeys);

      const sections = (snapshot.sections || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((s) => ({
          key: s.key,
          title: s.title || s.key,
          order: s.order || 0,
          sheetName: s.sheetName || "",
          groups: s.groups || [],
          fields: s.fields || [],
        }));

      const siblings = await ReportPeriods.find({
        ...buildBaoCaoOwnerFilter(req.user),
        templateId,
        _id: { $nin: [periodA._id, periodB._id] },
      })
        .select("tenKy tuNgay denNgay status updatedAt templateId")
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean();

      res.status(200).json({
        templateId,
        templateTen:
          periodA.templateId?.ten ||
          periodB.templateId?.ten ||
          snapshot.ten ||
          "",
        periodA: {
          _id: periodA._id,
          tenKy: periodA.tenKy,
          tuNgay: periodA.tuNgay,
          denNgay: periodA.denNgay,
          status: periodA.status,
        },
        periodB: {
          _id: periodB._id,
          tenKy: periodB.tenKy,
          tuNgay: periodB.tuNgay,
          denNgay: periodB.denNgay,
          status: periodB.status,
        },
        sections,
        rows,
        siblings,
      });
    } catch (error) {
      console.log("baoCao.comparePeriods:", error.message);
      res.status(error.status || 500).json({
        message: error.message || "Không so sánh được 2 kỳ",
      });
    }
  },
};
