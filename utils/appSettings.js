const AppSettings = require('../models/AppSettings');

async function getAppSettings() {
  let doc = await AppSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AppSettings.create({
      key: 'default',
      cho_phep_hoc_cauhoi: true,
    });
  }
  return doc;
}

module.exports = { getAppSettings };
