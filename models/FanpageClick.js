const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const fanpageClickSchema = new Schema(
  {
    name: String,
    phone: String,
    birthday: Schema.Types.Mixed,
    donvi: String,
    hokhau: String,
    gioitinh: String,
    loaixe: String,
    hang_gplx: String,
    nghenghiep: String,
    cuocthi: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cuocthis",
      index: true,
    },
    tencuocthi: String,
    origin: String,
    hostname: String,
    userAgent: String,
  },
  { timestamps: true }
);

fanpageClickSchema.index({ cuocthi: 1, createdAt: -1 });
fanpageClickSchema.index({ name: 1, createdAt: -1 });
fanpageClickSchema.index({ hostname: 1, createdAt: -1 });

const FanpageClicks = mongoose.model("FanpageClick", fanpageClickSchema);

module.exports = FanpageClicks;
