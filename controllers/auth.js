const jwt = require("jsonwebtoken");
const RefreshTokens = require("../models/RefreshToken");
const Users = require("../models/User");
const bcrypt = require('bcrypt');
const saltRounds = 10;

const getAccessTokenKey = () => {
  const key = process.env.ACCESS_TOKEN_KEY;
  if (!key) throw new Error("ACCESS_TOKEN_KEY chưa được cấu hình trong .env");
  return key;
};

const getRefreshTokenKey = () => {
  const key = process.env.REFRESH_TOKEN_KEY;
  if (!key) throw new Error("REFRESH_TOKEN_KEY chưa được cấu hình trong .env");
  return key;
};

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge,
});

// Băm mật khẩu
const hashPassword = async (password) => {
  return await bcrypt.hash(password, saltRounds);
};

// Kiểm tra mật khẩu
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
module.exports = {
  login: async (req, res) => {
    try {
      let user = await Users.findOne({
        tentaikhoan: req.body.tentaikhoan,
      });
      if (!user) {
        return res.status(403).json({ status: false, message: "Sai tên đăng nhập" });
      }

      const isMatch = await comparePassword(req.body.matkhau, user.matkhau);
      // console.log(isMatch)
      if (!isMatch) {
        return res.status(501).json({ status: "failed", message: "Mật khẩu không chính xác" });
      }

      let refreshTokenCookie = req.cookies.refreshToken_thitracnghiem;
      if (refreshTokenCookie) {
        await RefreshTokens.findOneAndDelete({ refreshToken: refreshTokenCookie });
      }

      const accessToken = jwt.sign({ userId: user._id }, getAccessTokenKey(), {
        expiresIn: "1h",
      });

      const refreshToken = jwt.sign({ userId: user._id }, getRefreshTokenKey(), {
        expiresIn: "7d",
      });

      let newItem = new RefreshTokens({ refreshToken });
      await newItem.save();

      res.cookie("accessToken_thitracnghiem", accessToken, cookieOptions(60 * 60 * 1000));
      res.cookie("refreshToken_thitracnghiem", refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

      res.status(200).json({
        status: "success",
        _id: user._id,
        tentaikhoan: user.tentaikhoan,
        roles: user.roles,
      });
    } catch (error) {
      console.log(error.message);
      res.status(501).json({ status: "failed", message: "Lỗi đăng nhập hệ thống" });
    }
  },
  getMe: async (req, res) => {
    try {
      const userId = req.userId?.userId;
      if (!userId) {
        return res.status(401).json({ message: "You are not authenticated" });
      }

      const user = await Users.findById(userId).select("-matkhau");
      if (!user) {
        return res.status(401).json({ message: "Tài khoản không tồn tại, vui lòng đăng nhập lại" });
      }

      return res.status(200).json({
        status: "success",
        _id: user._id,
        tentaikhoan: user.tentaikhoan,
        roles: user.roles,
      });
    } catch (error) {
      console.log(error.message);
      return res.status(501).json({ status: "failed", message: "Lỗi xác thực phiên đăng nhập" });
    }
  },
  logout: async (req, res) => {
    let refreshTokenCookie = req.cookies.refreshToken_thitracnghiem;
    try {
      if (refreshTokenCookie) {
        await RefreshTokens.findOneAndDelete({ refreshToken: refreshTokenCookie });
      }

      res.clearCookie("accessToken_thitracnghiem", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      res.clearCookie("refreshToken_thitracnghiem", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      res.status(200).json({ status: "success", message: "Đăng xuất thành công" });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Lỗi server hệ thống" });
    }
  },
  getUserList: async (req, res) => {
    let perPage = 5;

    let page = Number(req.query.page) || 1;
    try {
      let usersDb = await Users.find().populate('quantrinhomdonvi').sort({ thutu: 1 });

      let total = Math.ceil(usersDb.length / perPage);
      let users = await Users.find().sort({ thutu: 1 }).skip((page - 1) * perPage).limit(perPage).populate('quantrinhomdonvi');
      res.status(200).json({ status: "success", users, page, total })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra khi lấy dữ liệu người dùng" });
    }
  },
  addUser: async (req, res) => {
    let { tentaikhoan, matkhau, thutu } = req.body;
    let perPage = 5;
    let page = 1;
    try {
      matkhau = await hashPassword(matkhau);
      let newItem = new Users({
        tentaikhoan,
        matkhau,
        thutu: Number(thutu),
        roles: [],
        quantrinhomdonvi: []
      });
      await newItem.save();
      let usersDb = await Users.find().sort({ thutu: 1 });

      let total = Math.ceil(usersDb.length / perPage);
      let users = await Users.find().sort({ thutu: 1 }).skip((page - 1) * perPage).limit(perPage);
      res.status(200).json({ status: "success", users, total, message: "Thêm tài khoản người dùng thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra khi thêm mới người dùng" });
    }
  },
  editUser: async (req, res) => {
    let id = req.params.id;
    const { roles, page } = req.body;
    // const {roles, page} = req.body;
    let perPage = 5;
    try {
      await Users.findByIdAndUpdate(id, {
        roles
      });
      let users = await Users.find().sort({ thutu: 1 }).skip((page - 1) * perPage).limit(perPage);
      console.log('suawr usser')
      res.status(200).json({ status: "success", users, message: "Cập nhật phân quyền tài khoản người dùng thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra khi cập nhật phân quyền người dùng" });
    }
  },
  deleteUser: async (req, res) => {
    let id = req.params.id;
    let perPage = 5;
    let page = 1;
    try {
      await Users.findByIdAndDelete(id);
      let usersDb = await Users.find().sort({ thutu: 1 });

      let total = Math.ceil(usersDb.length / perPage);
      let users = await Users.find().sort({ thutu: 1 }).skip((page - 1) * perPage).limit(perPage);

      res.status(200).json({ status: "success", users, total, message: "Xóa tài khoản người dùng thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra khi xóa người dùng" });
    }
  },

  requestRefreshToken: async (req, res) => {
    const refreshToken = req.cookies.refreshToken_thitracnghiem;
    if (!refreshToken) {
      return res.status(501).json({ message: "You are not authenticated" });
    }

    const checkRefreshTokenInDb = await RefreshTokens.findOne({ refreshToken });
    if (!checkRefreshTokenInDb) {
      return res.status(402).json({ message: "Token không hợp lệ" });
    }

    jwt.verify(refreshToken, getRefreshTokenKey(), async (err, user) => {
      if (err || !user?.userId) {
        return res.status(403).json({ message: "Token đã hết hạn, vui lòng đăng nhập lại" });
      }

      try {
        const newAccessToken = jwt.sign({ userId: user.userId }, getAccessTokenKey(), {
          expiresIn: "1h",
        });

        const newRefreshToken = jwt.sign({ userId: user.userId }, getRefreshTokenKey(), {
          expiresIn: "7d",
        });

        await RefreshTokens.findOneAndDelete({ refreshToken });
        await new RefreshTokens({ refreshToken: newRefreshToken }).save();

        res.cookie("accessToken_thitracnghiem", newAccessToken, cookieOptions(60 * 60 * 1000));
        res.cookie("refreshToken_thitracnghiem", newRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

        return res.status(200).json({ status: "success" });
      } catch (error) {
        console.log(error.message);
        return res.status(501).json({ message: "Lỗi làm mới phiên đăng nhập" });
      }
    });
  },
  editPhanquyendonvi: async (req, res) => {
    let id = req.params.id;
    const { quantrinhomdonvi, page } = req.body;
    // const {roles, page} = req.body;
    let perPage = 5;
    try {
      await Users.findByIdAndUpdate(id, {
        quantrinhomdonvi
      });
      let users = await Users.find().sort({ thutu: 1 }).skip((page - 1) * perPage).limit(perPage).populate('quantrinhomdonvi');

      res.status(200).json({ status: "success", users, message: "Cập nhật phân quyền quản trị nhóm đơn vị thành công" })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra khi cập nhật phân quyền quản trị nhóm đơn vị" });
    }
  },
  changePassword: async (req, res) => {
    let { tentaikhoan, matkhau, matkhaumoi } = req.body;
    try {
      let user = await Users.findOne({
        tentaikhoan: req.body.tentaikhoan,
      });
      if (!user) {
        return res.status(403).json({ status: false, message: "Sai tên đăng nhập" });
      } else {

        const isMatch = await comparePassword(req.body.matkhau, user.matkhau);
        console.log(isMatch)
        if (!isMatch) {
          res.status(400).json({ status: "failed", message: "Mật khẩu không chính xác" });
          return;
        }

        matkhaunew = await hashPassword(matkhaumoi);
        user.matkhau = matkhaunew;
        await user.save();
        res.status(200).json({ message: "Đổi mật khấu thành công. Vui lòng đăng nhập lại." })
      }

    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Lỗi server, Vui lòng liên hệ quản trị hệ thống" });
    }
  }
};
