const jwt = require("jsonwebtoken");

const middlewareController = {

  verifyToken: (req, res, next) => {

    try {

      // LẤY TOKEN TỪ COOKIE
      const accessToken = req.cookies.accessToken_thitracnghiem;

      // KHÔNG CÓ TOKEN
      if (!accessToken) {

        return res.status(401).json({
          message: "You are not authenticated",
        });
      }

      // VERIFY TOKEN
      jwt.verify(
        accessToken,
        process.env.ACCESS_TOKEN_KEY,

        (err, user) => {

          // TOKEN SAI / HẾT HẠN
          if (err) {

            return res.status(403).json({
              message: "Token đã hết hạn, vui lòng đăng nhập lại",
            });
          }

          // SAVE USER INFO
          req.userId = user;

          next();
        }
      );

    } catch (error) {

      return res.status(500).json({
        message: error.message,
      });
    }
  },
};

module.exports = middlewareController;