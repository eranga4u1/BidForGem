const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withOptionalPortraitFeature(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = (manifest["uses-feature"] ??= []);
    const name = "android.hardware.screen.portrait";
    const portrait = features.find((feature) => feature.$["android:name"] === name);

    // The activity's portrait preference otherwise implies a Play device requirement.
    if (portrait) {
      portrait.$["android:required"] = "false";
    } else {
      features.push({ $: { "android:name": name, "android:required": "false" } });
    }

    return config;
  });
};
