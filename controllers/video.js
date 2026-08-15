const Cauhois = require("../models/CauHoi");
const Videos = require("../models/Videos");
const Joi = require("joi");
const path = require('path')
const fs = require('fs')
module.exports = {
    getVideos: async (req, res) => {
        try {
            let items = await Videos.find({
            }).sort({ thutu: 1 })
            res.status(200).json(items)
        } catch (error) {
            console.log("lỗi: ", error.message);
            res
                .status(401)
                .json({
                    status: "failed",
                    message: "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
                });
        }
    },

    addVideo: async (req, res) => {
        try {
            let { name, thutu, mota, link_orther, is_source_link_orther } = req.body;
            is_source_link_orther = is_source_link_orther === 'true' ? true : false
            // 🛡️ Kiểm tra xem người dùng đã chọn file chưa
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

                // Tính dung lượng file gọn gàng (VD: 15.4 MB)
                fileSizeInMB = (req.file.size / (1024 * 1024)).toFixed(2) + " MB";

            };
            // Lưu vào Database
            let newItem = new Videos({
                nameFile: req.file?.originalname || "",
                name: name,
                link: videoLink,
                sizeFile: fileSizeInMB,
                mota: mota || "",
                thutu: thutu ? Number(thutu) : 0,
                is_source_link_orther,
                link_orther
            });

            await newItem.save();

            // Lấy danh sách video đã sắp xếp
            let items = await Videos.find({}).sort({ thutu: 1 });

            return res.status(200).json({
                status: "success",
                message: "Thêm mới video thành công",
                items
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
        let id = req.params.id; //id thí sinh
        let { name, thutu, mota } = req.body;
        console.log(req.body)
        try {
            await Videos.findByIdAndUpdate(id, {
                name, thutu, mota
            });

            let items = await Videos.find({
            }).sort({ thutu: 1 })

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

    deleteVideo: async (req, res) => {
        const { id } = req.params;
        // 1. Validate ID truyền vào (bắt buộc đúng định dạng ObjectId 24 ký tự)
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
            // 2. Tìm thông tin video trong DB trước (để lấy đường dẫn file link)
            const video = await Videos.findById(value.id);
            if (!video) {
                return res.status(404).json({
                    status: "failed",
                    message: "Không tìm thấy video cần xóa",
                });
            }

            // 3. HÀM XÓA FILE VẬT LÝ AN TOÀN (Chống Path Traversal)
            const publicBaseDir = path.resolve(__dirname, "../public");

            const safeDeleteFile = (filePath) => {
                if (!filePath) return;

                // Bóc tách lấy đúng tên file (VD: "/public/17182938102-video.mp4" -> "17182938102-video.mp4")
                const safeFileName = path.basename(String(filePath));
                if (!safeFileName) return;

                // Dựng đường dẫn tuyệt đối đến file
                const targetPath = path.resolve(publicBaseDir, safeFileName);

                // 🛡️ BẢO VỆ: File bắt buộc phải nằm trong publicBaseDir và phải tồn tại
                if (
                    targetPath.startsWith(publicBaseDir) &&
                    targetPath !== publicBaseDir &&
                    fs.existsSync(targetPath)
                ) {
                    try {
                        fs.unlinkSync(targetPath); // Lệnh xóa file vật lý
                        console.log(`Đã xóa file video an toàn: ${targetPath}`);
                    } catch (err) {
                        console.error(`Lỗi khi xóa file ${targetPath}:`, err);
                    }
                }
            };

            // 4. Thực hiện xóa file vật lý trên đĩa
            safeDeleteFile(video.link);

            // 5. Xóa record trong Database
            await Videos.findByIdAndDelete(value.id);

            // 6. Lấy lại danh sách video mới nhất đã sắp xếp
            const items = await Videos.find({}).sort({ thutu: 1 });

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

        // 1. Validate ID truyền vào (ObjectId chuẩn)
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
            // 2. Tìm và Tăng totalView lên 1 đơn vị bằng $inc
            // { new: true } để trả về data video mới sau khi đã cộng view
            const updatedVideo = await Videos.findByIdAndUpdate(
                value.id,
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
    }
};
