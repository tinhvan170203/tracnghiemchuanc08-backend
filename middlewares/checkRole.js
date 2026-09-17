const Users = require("../models/User");

/** role: string hoặc mảng string — đủ 1 quyền là qua */
let checkRole = (role) => {
    return async(req, res, next) => {
        let userId = req.userId.userId;

        const user = await Users.findOne({_id: userId}).populate('quantrinhomdonvi');

        if(user === null){
            res.status(403).json({message: "Tài khoản không tồn tại, vui lòng đăng nhập lại"})
        }else{
            let roles = user.roles;
            req.user = user;
            const required = Array.isArray(role) ? role : [role];
            let checkedRole = required.some((r) => roles.includes(r));
            
            if(!checkedRole){
                const label = required.join(" / ");
                res.status(403).json({message: `Tài khoản không có quyền ${label}, vui lòng đăng nhập tài khoản có chức năng này!`});
                return;
            };

            next()
        }
     }
}

module.exports = checkRole;
