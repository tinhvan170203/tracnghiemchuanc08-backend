
const Diaphuongs = require("../models/Diaphuongs");
const mongoose = require("mongoose");
const {
  resolveDiaphuongApiBaseForSave,
  buildDiaphuongPublicUrl,
} = require("../utils/diaphuongApiUrl");
const { fetchRemoteJson } = require("../controllers/fanpage");
const {
  normalizeDemographicFilters,
  hasDemographicFilters,
} = require("../utils/demographicFilters");

function isDomainValidationError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Domain không") ||
    message.includes("Chỉ cho phép domain") ||
    message.includes("Không cho phép IP") ||
    message.includes("định dạng URL") ||
    message.includes("không được phép") ||
    message.includes("địa chỉ nội bộ")
  );
}

module.exports = {
  getDiaphuongs: async (req, res) => {
    try {
      let items = await Diaphuongs.find().sort({ thutu: 1 });
      res.status(200).json(items)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(500)
        .json({
          status: "failed",
          message: "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
        });
    }
  },

  addDiaphuong: async (req, res) => {
    try {
      if (req.body.domain) {
        req.body.domain = await resolveDiaphuongApiBaseForSave(req.body.domain);
      }
      let newItem = new Diaphuongs(req.body);
      await newItem.save();
      let items = await Diaphuongs.find().sort({ thutu: 1 });

      res.status(200).json({
        status: "success",
        message: "Thêm mới thành công",
        items
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      const status = isDomainValidationError(error) ? 400 : 500;
      res.status(status).json({
        status: "failed",
        message: error.message || "Có lỗi xảy ra khi thêm mới",
      });
    }
  },
  updatedDiaphuong: async (req, res) => {
    let id = req.params.id;

    try {
      if (req.body.domain) {
        req.body.domain = await resolveDiaphuongApiBaseForSave(req.body.domain);
      }
      await Diaphuongs.findByIdAndUpdate(id, req.body);

      let items = await Diaphuongs.find().sort({ thutu: 1 });

      res.status(200).json({ message: "update thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      const status = isDomainValidationError(error) ? 400 : 500;
      res.status(status).json({
        status: "failed",
        message: error.message ||
          "Có lỗi xảy ra khi điều chỉnh. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  },

  deleteDiaphuong: async (req, res) => {
    let id = req.params.id;
    try {
      await Diaphuongs.findByIdAndDelete(id);
      let items = await Diaphuongs.find().sort({ thutu: 1 });
      res.status(200).json({ message: "Xóa thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(500).json({
        status: "failed",
        message:
          "Có lỗi xảy ra khi xóa. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  },

  sumaryKetquas: async (req, res) => {
    try {
      let {
        fromDate,
        toDate,
        list,
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
      } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({
          message: "Thiếu fromDate hoặc toDate",
        });
      }
      const normalized = normalizeDemographicFilters({
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
      });
      const demographicRequested = hasDemographicFilters(req.query);

      let ids = Array.isArray(list) ? list : (list ? [list] : []);
      let dsDiaPhuong = await Diaphuongs.find({ _id: { $in: ids } }).lean();
      const results = await Promise.all(
        dsDiaPhuong.map(async (item) => {
          try {
            const apiBase = await resolveDiaphuongApiBaseForSave(item.domain);
            const url = buildDiaphuongPublicUrl(
              apiBase,
              "/public/sumary/toan-quoc",
              {
                fromDate,
                toDate,
                ageFrom: normalized.ageFrom,
                ageTo: normalized.ageTo,
                gioitinh: normalized.gioitinh,
                loaixe: normalized.loaixe,
              }
            );

            const data = await fetchRemoteJson(url, 15000);
            if (demographicRequested && data?.filterVersion !== 1) {
              throw new Error(
                "Domain chưa hỗ trợ bộ lọc tuổi, giới tính và phương tiện"
              );
            }

            return {
              success: true,
              text: item.text,
              domain: item.domain,
              data
            };
          } catch (error) {
            return {
              success: false,
              text: item.text,
              domain: item.domain,
              error: error.message
            };
          }
        })
      );

      const listSuccess = results.filter(x => x.success);
      const listError = results.filter(x => !x.success);
      res.status(200).json({ listSuccess, listError })
    } catch (error) {
      console.log(error.message);
      res.status(error.status || 500).json({ message: error.message })
    }
  },

  fetchFanpageClicksToanquoc: async (req, res) => {
    try {
      const { fromDate, toDate, list } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({
          message: "Thiếu fromDate hoặc toDate",
        });
      }

      const rawIds = Array.isArray(list) ? list : list ? [list] : [];
      const ids = rawIds
        .map((id) => String(id).trim())
        .filter((id) => mongoose.isValidObjectId(id));

      if (ids.length === 0) {
        return res.status(200).json({ items: [], total: 0, listError: [] });
      }

      const dsDiaPhuong = await Diaphuongs.find({ _id: { $in: ids } }).lean();

      const results = await Promise.all(
        dsDiaPhuong.map(async (item) => {
          try {
            const apiBase = await resolveDiaphuongApiBaseForSave(item.domain);
            const url = buildDiaphuongPublicUrl(
              apiBase,
              "/public/sumary/fanpage",
              { fromDate, toDate }
            );

            const data = await fetchRemoteJson(url, 20000);
            const remoteItems = Array.isArray(data?.items) ? data.items : [];
            const diaphuongHostname = url.hostname || "";

            return {
              success: true,
              text: item.text,
              domain: item.domain,
              hostname: diaphuongHostname,
              items: remoteItems.map((row) => ({
                ...row,
                diaphuongText: item.text,
                diaphuongDomain:
                  diaphuongHostname || row.hostname || row.origin || "",
                diaphuongId: String(item._id),
              })),
            };
          } catch (error) {
            return {
              success: false,
              text: item.text,
              domain: item.domain,
              error: error.message,
            };
          }
        })
      );

      const listSuccess = results.filter((x) => x.success);
      const listError = results.filter((x) => !x.success);
      const items = listSuccess
        .flatMap((x) => x.items || [])
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });

      return res.status(200).json({
        items,
        total: items.length,
        listError,
      });
    } catch (error) {
      console.log("fetchFanpageClicksToanquoc:", error.message);
      return res.status(500).json({ message: error.message });
    }
  },

  fetchAiChatToanquoc: async (req, res) => {
    try {
      const { fromDate, toDate, list } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({
          message: "Thiếu fromDate hoặc toDate",
        });
      }

      const rawIds = Array.isArray(list) ? list : list ? [list] : [];
      const ids = rawIds
        .map((id) => String(id).trim())
        .filter((id) => mongoose.isValidObjectId(id));

      if (ids.length === 0) {
        return res.status(200).json({
          items: [],
          total: 0,
          listError: [],
          domainSummaries: [],
          summary: {
            requestCount: 0,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            embeddingTokens: 0,
            estimatedUsd: 0,
            estimatedVnd: 0,
          },
        });
      }

      const {
        accumulateTokens,
        emptyTokenTotals,
        finalizeSummary,
        estimateUsd,
        usdToVnd,
      } = require("../utils/openaiPricing");

      const dsDiaPhuong = await Diaphuongs.find({ _id: { $in: ids } }).lean();

      const results = await Promise.all(
        dsDiaPhuong.map(async (item) => {
          try {
            const apiBase = await resolveDiaphuongApiBaseForSave(item.domain);
            const url = buildDiaphuongPublicUrl(
              apiBase,
              "/public/sumary/ai-chat",
              { fromDate, toDate }
            );

            const data = await fetchRemoteJson(url, 20000);
            const remoteItems = Array.isArray(data?.items) ? data.items : [];
            const diaphuongHostname = url.hostname || "";

            const domainAcc = emptyTokenTotals();
            if (data?.summary && typeof data.summary === "object") {
              domainAcc.requestCount = Number(data.summary.requestCount) || 0;
              domainAcc.promptTokens = Number(data.summary.promptTokens) || 0;
              domainAcc.completionTokens =
                Number(data.summary.completionTokens) || 0;
              domainAcc.totalTokens = Number(data.summary.totalTokens) || 0;
              domainAcc.embeddingTokens =
                Number(data.summary.embeddingTokens) || 0;
            } else {
              for (const row of remoteItems) accumulateTokens(domainAcc, row);
            }

            const domainSummary = {
              diaphuongText: item.text,
              diaphuongId: String(item._id),
              domain: item.domain,
              hostname: diaphuongHostname,
              ...finalizeSummary(domainAcc),
            };

            return {
              success: true,
              text: item.text,
              domain: item.domain,
              hostname: diaphuongHostname,
              domainSummary,
              items: remoteItems.map((row) => {
                const estimatedUsd =
                  row.estimatedUsd != null
                    ? Number(row.estimatedUsd)
                    : estimateUsd(row);
                const estimatedVnd =
                  row.estimatedVnd != null
                    ? Number(row.estimatedVnd)
                    : usdToVnd(estimatedUsd);
                return {
                  ...row,
                  estimatedUsd,
                  estimatedVnd,
                  diaphuongText: item.text,
                  diaphuongDomain:
                    diaphuongHostname || row.hostname || row.origin || "",
                  diaphuongId: String(item._id),
                };
              }),
            };
          } catch (error) {
            return {
              success: false,
              text: item.text,
              domain: item.domain,
              error: error.message,
            };
          }
        })
      );

      const listSuccess = results.filter((x) => x.success);
      const listError = results.filter((x) => !x.success);
      const items = listSuccess
        .flatMap((x) => x.items || [])
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });

      const domainSummaries = listSuccess.map((x) => x.domainSummary);
      const totalAcc = emptyTokenTotals();
      for (const ds of domainSummaries) {
        totalAcc.requestCount += Number(ds.requestCount) || 0;
        totalAcc.promptTokens += Number(ds.promptTokens) || 0;
        totalAcc.completionTokens += Number(ds.completionTokens) || 0;
        totalAcc.totalTokens += Number(ds.totalTokens) || 0;
        totalAcc.embeddingTokens += Number(ds.embeddingTokens) || 0;
      }

      return res.status(200).json({
        items,
        total: items.length,
        listError,
        domainSummaries,
        summary: finalizeSummary(totalAcc),
      });
    } catch (error) {
      console.log("fetchAiChatToanquoc:", error.message);
      return res.status(500).json({ message: error.message });
    }
  },


};
