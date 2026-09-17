const Videos = require("../models/Videos");
const Users = require("../models/User");
const Joi = require("joi");
const path = require("path");
const fs = require("fs");

const parseBoolActive = (value) => value !== "false" && value !== false;

const buildVideoFilter = ({ search, active, isAdmin }) => {
    const filter = {};

    if (!isAdmin) {
        filter.active = { $ne: false };
    } else if (active === "true") {
        filter.active = { $ne: false };
    } else if (active === "false") {
        filter.active = false;
    }

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: "i" } },
            { mota: { $regex: search, $options: "i" } },
        ];
    }

    return filter;
};

const isVideoAdmin = async (req) => {
    if (!req.userId?.userId) return false;
    const user = await Users.findOne({ _id: req.userId.userId });
    return user?.roles?.includes("xem video tuyên truyền") ?? false;
};

const fetchVideos = async ({ search = "", active = "", isAdmin = false }) => {
    const filter = buildVideoFilter({ search, active, isAdmin });
    return Videos.find(filter).sort({ thutu: 1 });
};

module.exports = {
    getVideos: async (req, res) => {
        try {
            const search = req.query.search || "";
            const active = req.query.active || "";
            const isAdmin = req.query.scope === "admin" && (await isVideoAdmin(req));
            const items = await fetchVideos({ search, active, isAdmin });
            res.status(200).json(items);
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message: "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
            });
        }
    },

    addVideo: async (req, res) => {
        try {
            let { name, thutu, mota, link_orther, is_source_link_orther, active } = req.body;
            is_source_link_orther = is_source_link_orther === "true" ? true : false;
            if (!is_source_link_orther && !req.file) {
                return res.status(400).json({
                    status: "failed",
                    message: "Vui lòng chọn file video để upload!",
                });
            }

            let videoLink = "";
            let safeFileName = "";
            let fileSizeInMB = "";
            if (!is_source_link_orther && req.file) {
                safeFileName = path.basename(req.file.filename) || "";
                videoLink = `${safeFileName}`;
                fileSizeInMB = (req.file.size / (1024 * 1024)).toFixed(2) + " MB";
            }

            let newItem = new Videos({
                nameFile: req.file?.originalname || "",
                name: name,
                link: videoLink,
                sizeFile: fileSizeInMB,
                mota: mota || "",
                thutu: thutu ? Number(thutu) : 0,
                is_source_link_orther,
                link_orther,
                active: parseBoolActive(active),
            });

            await newItem.save();

            const items = await fetchVideos({
                search: req.query.search || "",
                active: req.query.active || "",
                isAdmin: true,
            });

            return res.status(200).json({
                status: "success",
                message: "Thêm mới video thành công",
                items,
            });
        } catch (error) {
            console.error("Lỗi addVideo: ", error.message);
            return res.status(500).json({
                status: "failed",
                message: error.message || "Có lỗi xảy ra khi thêm mới video",
            });
        }
    },

    updatedVideo: async (req, res) => {
        let id = req.params.id;
        let { name, thutu, mota, active } = req.body;
        try {
            await Videos.findByIdAndUpdate(id, {
                name,
                thutu,
                mota,
                active: parseBoolActive(active),
            });

            const items = await fetchVideos({
                search: req.query.search || "",
                active: req.query.active || "",
                isAdmin: true,
            });

            res.status(200).json({ message: "update thành công", items });
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(501).json({
                status: "failed",
                message:
                    "Có lỗi xảy ra khi điều chỉnh. Vui lòng liên hệ quản trị hệ thống.",
            });
        }
    },

    toggleActive: async (req, res) => {
        let id = req.params.id;
        let { active, search, activeFilter } = req.body;
        try {
            await Videos.findByIdAndUpdate(id, {
                active: parseBoolActive(active),
            });

            const items = await fetchVideos({
                search: search || "",
                active: activeFilter || "",
                isAdmin: true,
            });

            res.status(200).json({ message: "Cập nhật trạng thái thành công", items });
        } catch (error) {
            console.log("lỗi: ", error.message);
            res.status(401).json({
                status: "failed",
                message:
                    "Có lỗi xảy ra khi cập nhật trạng thái. Vui lòng liên hệ quản trị hệ thống.",
            });
        }
    },

    deleteVideo: async (req, res) => {
        const { id } = req.params;
        const schema = Joi.object({
            id: Joi.string().hex().length(24).required(),
        });

        const { error, value } = schema.validate({ id });
        if (error) {
            return res.status(400).json({
                status: "failed",
                message: "Lỗi giá trị nhập vào. ID video không hợp lệ.",
            });
        }

        try {
            const video = await Videos.findById(value.id);
            if (!video) {
                return res.status(404).json({
                    status: "failed",
                    message: "Không tìm thấy video cần xóa",
                });
            }

            const publicBaseDir = path.resolve(__dirname, "../public");

            const safeDeleteFile = (filePath) => {
                if (!filePath) return;

                const safeFileName = path.basename(String(filePath));
                if (!safeFileName) return;

                const targetPath = path.resolve(publicBaseDir, safeFileName);

                if (
                    targetPath.startsWith(publicBaseDir) &&
                    targetPath !== publicBaseDir &&
                    fs.existsSync(targetPath)
                ) {
                    try {
                        fs.unlinkSync(targetPath);
                        console.log(`Đã xóa file video an toàn: ${targetPath}`);
                    } catch (err) {
                        console.error(`Lỗi khi xóa file ${targetPath}:`, err);
                    }
                }
            };

            safeDeleteFile(video.link);

            await Videos.findByIdAndDelete(value.id);

            const items = await fetchVideos({
                search: req.query.search || "",
                active: req.query.active || "",
                isAdmin: true,
            });

            return res.status(200).json({
                status: "success",
                message: "Xóa video thành công",
                items,
            });
        } catch (error) {
            console.error("Lỗi deleteVideo:", error);
            return res.status(500).json({
                status: "failed",
                message: "Có lỗi xảy ra khi xóa video. Vui lòng liên hệ quản trị hệ thống.",
            });
        }
    },

    incView: async (req, res) => {
        const { id } = req.query;

        const schema = Joi.object({
            id: Joi.string().hex().length(24).required(),
        });

        const { error, value } = schema.validate({ id });
        if (error) {
            return res.status(400).json({
                status: "failed",
                message: "Lỗi giá trị nhập vào. ID video không hợp lệ.",
            });
        }

        try {
            const updatedVideo = await Videos.findOneAndUpdate(
                { _id: value.id, active: { $ne: false } },
                { $inc: { totalView: 1 } },
                { new: true }
            );

            if (!updatedVideo) {
                return res.status(404).json({
                    status: "failed",
                    message: "Không tìm thấy video để tăng lượt xem.",
                });
            }

            return res.status(200).json({
                status: "success",
                message: "Tăng lượt xem thành công",
                totalView: updatedVideo.totalView,
            });
        } catch (error) {
            console.error("Lỗi incView:", error);
            return res.status(500).json({
                status: "failed",
                message: "Có lỗi xảy ra khi tăng lượt xem.",
            });
        }
    },
};
