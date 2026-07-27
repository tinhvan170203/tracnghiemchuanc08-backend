const Users = require("../models/User");

let checkRole = (role) => {
    return async(req, res, next) => {
        let userId = req.userId.userId;

        const user = await Users.findOne({_id: userId}).populate('quantrinhomdonvi');

        if(user === null){
            res.status(403).json({message: "Tài khoản không tồn tại, vui lòng đăng nhập lại"})
        }else{
            let roles = user.roles;
            req.user = user;
            let checkedRole = roles.includes(role);
            
            if(!checkedRole){
                res.status(401).json({message: `Tài khoản không có quyền ${role}, vui lòng đăng nhập tài khoản có chức năng này!`});
                return;
            };

            next()
        }
     }
}

module.exports = checkRole;