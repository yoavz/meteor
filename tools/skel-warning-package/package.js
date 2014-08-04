Package.describe({
  summary: "INCOMPATIBLE WITH 0.9.0",
  version: "~version~",
});

Package.onUse(function(api) {
  api.addFiles('warning-package.js');
});
