const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const appSettingsSchema = new Schema({
  key: {
    type: String,
    unique: true,
    default: 'default',
  },
  cho_phep_hoc_cauhoi: {
    type: Boolean,
    default: true,
  },
});

const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

module.exports = AppSettings;
