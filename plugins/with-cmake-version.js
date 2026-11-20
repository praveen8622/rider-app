const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// yatri-cmake-version';

// The SDK's default CMake 3.22 ships Ninja 1.10, which can't create the long object paths the
// autolinked codegen produces on Windows. CMake 3.31 ships Ninja 1.12, which supports long paths.
const block = `
${MARKER}
android {
    externalNativeBuild {
        cmake {
            version "3.31.6"
        }
    }
}
`;

module.exports = function withCmakeVersion(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += block;
    }
    return cfg;
  });
};
