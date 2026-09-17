const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const FanpageClicks = require("../models/FanpageClick");
const Cuocthis = require("../models/Cuocthi");
const { buildCuocthiAccessFilter } = require("../utils/cuocthiAccess");

const PUBLIC_LIST_MAX = 5000;


/** Parse yyyy-mm-dd as local calendar day (tránh lệch UTC). */
function parseLocalDay(dateStr, endOfDay) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (endOfDay) {
    return new Date(y, mo, day, 23, 59, 59, 999);
  }
  return new Date(y, mo, day, 0, 0, 0, 0);
}

function buildDateFilter(fromDate, toDate) {
  if (!fromDate && !toDate) return null;
  const range = {};
  const from = parseLocalDay(fromDate, false);
  const to = parseLocalDay(toDate, true);
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return Object.keys(range).length ? range : null;
}

function resolveOriginHostname(body, headers = {}) {
  let origin = String(body?.origin || "").trim();
  let hostname = String(body?.hostname || "").trim();

  if (!origin && headers.origin) {
    origin = String(headers.origin).trim();
  }
  if (!origin && headers.referer) {
    try {
      origin = new URL(headers.referer).origin;
    } catch (_) {
      /* ignore */
    }
  }
  if (!hostname && origin) {
    try {
      hostname = new URL(origin).hostname;
    } catch (_) {
      /* ignore */
    }
  }
  return { origin: origin || "", hostname: hostname || "" };
}

/**
 * Từ URL thống kê địa phương → các URL ứng viên danh sách fanpage.
 * Thử lần lượt vì domain có thể là API, FE, hoặc có prefix /c08.
 */
function buildFanpagePublicListUrlCandidates(domainUrl) {
  const base = new URL(domainUrl);
  const origin = base.origin;
  const path = base.pathname || "/";
  const candidates = [];

  const push = (pathname) => {
    try {
      const u = new URL(origin);
      u.pathname = String(pathname).replace(/\/{2,}/g, "/");
      u.search = "";
      u.hash = "";
      if (!candidates.some((c) => c.href === u.href)) candidates.push(u);
    } catch (_) {
      /* ignore */
    }
  };

  if (/sumary\/toan-quoc\/?$/i.test(path)) {
    push(path.replace(/sumary\/toan-quoc\/?$/i, "sumary/fanpage"));
  }

  const apiIdx = path.toLowerCase().indexOf("/api/");
  if (apiIdx >= 0) {
    push(`${path.slice(0, apiIdx)}/api/public/sumary/fanpage`);
  }

  push("/api/public/sumary/fanpage");
  push("/c08/api/public/sumary/fanpage");
  push("/public/sumary/fanpage");

  return candidates;
}

function buildFanpagePublicListUrl(domainUrl) {
  const list = buildFanpagePublicListUrlCandidates(domainUrl);
  return list[0] || new URL("/api/public/sumary/fanpage", domainUrl);
}

function formatFetchNetworkError(error, url) {
  const cause = error?.cause;
  const code = String(cause?.code || error?.code || "");
  const hostname = (() => {
    try {
      return new URL(String(url)).hostname;
    } catch {
      return "";
    }
  })();

  if (code === "ENOTFOUND" || /ENOTFOUND/i.test(String(cause?.message || ""))) {
    return `Không kết nối được domain "${hostname || url}": DNS không phân giải được (ENOTFOUND)`;
  }
  if (code === "ECONNREFUSED") {
    return `Không kết nối được domain "${hostname || url}": máy chủ từ chối kết nối (ECONNREFUSED)`;
  }
  if (code === "ECONNRESET") {
    return `Kết nối tới "${hostname || url}" bị ngắt (ECONNRESET)`;
  }
  if (
    code.startsWith("CERT_") ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    /certificate|SSL|TLS/i.test(String(cause?.message || error?.message || ""))
  ) {
    return `Lỗi chứng chỉ SSL khi gọi "${hostname || url}"`;
  }
  if (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    code === "ABORT_ERR" ||
    /aborted|timeout/i.test(String(error?.message || ""))
  ) {
    return `Hết thời gian chờ khi gọi "${hostname || url}"`;
  }

  const detail = cause?.message || error?.message || "fetch failed";
  return `Không gọi được ${url}: ${detail}`;
}

async function fetchRemoteJson(url, timeoutMs = 20000) {
  let response;
  try {
    response = await fetch(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new Error(formatFetchNetworkError(error, url));
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const trimmed = (text || "").trim();

  if (!response.ok) {
    if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
      throw new Error(
        `HTTP ${response.status} — server trả HTML (sai URL hoặc chưa deploy API). URL: ${url}`
      );
    }
    let remoteMessage = "";
    try {
      const body = JSON.parse(text);
      remoteMessage = String(body?.message || body?.error || "").trim();
    } catch (_) {
      /* ignore */
    }
    if (remoteMessage) {
      throw new Error(`HTTP ${response.status}: ${remoteMessage}. URL: ${url}`);
    }
    throw new Error(`HTTP ${response.status}. URL: ${url}`);
  }

  if (
    trimmed.startsWith("<!") ||
    trimmed.startsWith("<html") ||
    (contentType.includes("text/html") && !trimmed.startsWith("{"))
  ) {
    throw new Error(
      `Server trả HTML thay vì JSON (kiểm tra domain / đã deploy /api/public/sumary/fanpage). URL: ${url}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(`Phản hồi không phải JSON hợp lệ. URL: ${url}`);
  }
}

async function buildFanpageQuery(req) {
  const { fromDate, toDate, name, cuocthi, hostname } = req.query;
  const accessFilter = buildCuocthiAccessFilter(req.user);

  const query = {};

  const allowedCuocthiIds = await Cuocthis.find(accessFilter).distinct("_id");

  if (allowedCuocthiIds.length === 0) {
    return { query: { _id: null }, empty: true };
  }

  if (cuocthi) {
    if (!mongoose.isValidObjectId(cuocthi)) {
      return { query: { _id: null }, empty: true };
    }
    const allowed = allowedCuocthiIds.some(
      (id) => String(id) === String(cuocthi)
    );
    if (!allowed) {
      return { query: { _id: null }, empty: true };
    }
    query.cuocthi = cuocthi;
  } else {
    query.cuocthi = { $in: allowedCuocthiIds };
  }

  if (name && String(name).trim()) {
    query.name = { $regex: String(name).trim(), $options: "i" };
  }

  if (hostname && String(hostname).trim()) {
    query.hostname = {
      $regex: String(hostname).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }

  const dateRange = buildDateFilter(fromDate, toDate);
  if (dateRange) query.createdAt = dateRange;

  return { query, empty: false };
}

module.exports = {
  buildDateFilter,
  buildFanpagePublicListUrl,
  buildFanpagePublicListUrlCandidates,
  fetchRemoteJson,
  formatFetchNetworkError,
  resolveOriginHostname,

  logClick: async (req, res) => {
    try {
      const {
        name,
        phone,
        birthday,
        donvi,
        hokhau,
        gioitinh,
        loaixe,
        hang_gplx,
        nghenghiep,
        cuocthi,
        tencuocthi,
      } = req.body || {};

      if (!cuocthi || !mongoose.isValidObjectId(cuocthi)) {
        return res.status(400).json({
          status: "failed",
          message: "Thiếu hoặc sai thông tin cuộc thi",
        });
      }
      if (!name && !donvi) {
        return res.status(400).json({
          status: "failed",
          message: "Thiếu thông tin thí sinh",
        });
      }

      const { origin, hostname } = resolveOriginHostname(req.body, req.headers);

      await FanpageClicks.create({
        name: name || "",
        phone: phone || "",
        birthday: birthday ?? "",
        donvi: donvi || "",
        hokhau: hokhau || "",
        gioitinh: gioitinh || "",
        loaixe: loaixe || "",
        hang_gplx: hang_gplx || "",
        nghenghiep: nghenghiep || "",
        cuocthi,
        tencuocthi: tencuocthi || "",
        origin,
        hostname,
        userAgent: req.headers["user-agent"] || "",
      });

      return res.status(200).json({ status: "success" });
    } catch (error) {
      console.log("fanpage logClick:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không lưu được lượt theo dõi fanpage",
      });
    }
  },

  /** Public list for C08 hub aggregation — bắt buộc có khoảng ngày */
  publicList: async (req, res) => {
    try {
      const { fromDate, toDate } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({
          status: "failed",
          message: "Thiếu fromDate hoặc toDate",
        });
      }

      const dateRange = buildDateFilter(fromDate, toDate);
      if (!dateRange) {
        return res.status(400).json({
          status: "failed",
          message: "Khoảng ngày không hợp lệ",
        });
      }

      const items = await FanpageClicks.find({ createdAt: dateRange })
        .select(
          "name phone birthday donvi hokhau gioitinh loaixe hang_gplx nghenghiep cuocthi tencuocthi origin hostname createdAt"
        )
        .sort({ createdAt: -1 })
        .limit(PUBLIC_LIST_MAX)
        .lean();

      return res.status(200).json({
        items,
        total: items.length,
      });
    } catch (error) {
      console.log("fanpage publicList:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không tải được danh sách fanpage",
      });
    }
  },

  listCuocthiOptions: async (req, res) => {
    try {
      const baseFilter = buildCuocthiAccessFilter(req.user, {
        creatorIds: req.query.creatorIds,
        monthiId: req.query.monthi,
      });

      const limit = Math.min(
        50,
        Math.max(1, Number(req.query.limit) || 30)
      );
      const q = String(req.query.q || "").trim();
      const rawIds = Array.isArray(req.query.ids)
        ? req.query.ids
        : req.query.ids
          ? [req.query.ids]
          : req.query.id
            ? [req.query.id]
            : [];
      const hydrateIds = rawIds
        .map((id) => String(id).trim())
        .filter((id) => mongoose.isValidObjectId(id));

      const hydrateOnly =
        hydrateIds.length > 0 &&
        !q &&
        (req.query.hydrateOnly === "1" || req.query.hydrateOnly === "true");

      let searched = [];
      let hydrated = [];

      if (hydrateOnly) {
        hydrated = await Cuocthis.find({
          ...baseFilter,
          _id: { $in: hydrateIds },
        })
          .select("tencuocthi monthi createdAt createdBy")
          .lean();
      } else {
        const searchFilter = { ...baseFilter };
        if (q) {
          searchFilter.tencuocthi = {
            $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          };
        }

        [searched, hydrated] = await Promise.all([
          Cuocthis.find(searchFilter)
            .select("tencuocthi monthi createdAt createdBy")
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean(),
          hydrateIds.length
            ? Cuocthis.find({ ...baseFilter, _id: { $in: hydrateIds } })
                .select("tencuocthi monthi createdAt createdBy")
                .lean()
            : Promise.resolve([]),
        ]);
      }

      const byId = new Map();
      for (const row of [...hydrated, ...searched]) {
        byId.set(String(row._id), row);
      }
      const items = Array.from(byId.values());

      return res.status(200).json({ items, limit, q });
    } catch (error) {
      console.log("fanpage listCuocthiOptions:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không tải được danh sách cuộc thi",
      });
    }
  },

  listClicks: async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = 20;
      const { query, empty } = await buildFanpageQuery(req);

      if (empty) {
        return res.status(200).json({
          items: [],
          page: 1,
          total: 0,
          tongbanghi: 0,
        });
      }

      const tongbanghi = await FanpageClicks.countDocuments(query);
      const total = Math.ceil(tongbanghi / perPage) || 1;
      const items = await FanpageClicks.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean();

      return res.status(200).json({
        items,
        page,
        total,
        tongbanghi,
      });
    } catch (error) {
      console.log("fanpage listClicks:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không tải được danh sách",
      });
    }
  },

  exportExcel: async (req, res) => {
    try {
      const { query, empty } = await buildFanpageQuery(req);
      const items = empty
        ? []
        : await FanpageClicks.find(query).sort({ createdAt: -1 }).lean();

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Fanpage");

      worksheet.columns = [
        { header: "Thời gian", key: "thoigian", width: 20 },
        { header: "Họ tên", key: "name", width: 24 },
        { header: "SĐT", key: "donvi", width: 14 },
        { header: "Năm sinh", key: "birthday", width: 12 },
        { header: "Tỉnh", key: "hokhau", width: 16 },
        { header: "Xã", key: "phone", width: 16 },
        { header: "Giới tính", key: "gioitinh", width: 10 },
        { header: "Loại xe", key: "loaixe", width: 14 },
        { header: "Hạng GPLX", key: "hang_gplx", width: 12 },
        { header: "Nghề nghiệp", key: "nghenghiep", width: 16 },
        { header: "Cuộc thi", key: "tencuocthi", width: 36 },
        { header: "Domain", key: "hostname", width: 28 },
      ];

      items.forEach((row) => {
        worksheet.addRow({
          thoigian: row.createdAt
            ? new Date(row.createdAt).toLocaleString("vi-VN")
            : "",
          name: row.name || "",
          donvi: row.donvi || "",
          birthday: row.birthday ?? "",
          hokhau: row.hokhau || "",
          phone: row.phone || "",
          gioitinh: row.gioitinh || "",
          loaixe: row.loaixe || "",
          hang_gplx: row.hang_gplx || "",
          nghenghiep: row.nghenghiep || "",
          tencuocthi: row.tencuocthi || "",
          hostname: row.hostname || row.origin || "",
        });
      });

      worksheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="FanpageClicks.xlsx"'
      );
      return res.send(buffer);
    } catch (error) {
      console.log("fanpage exportExcel:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không xuất được Excel",
      });
    }
  },
};
