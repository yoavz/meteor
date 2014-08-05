Package.describe({
  summary: "INCOMPATIBLE WITH METEOR 0.9.0 OR LATER",
  version: ~version~,
});

Package.onUse(function(api) {
  api.addFiles('warning-package.js');
});
