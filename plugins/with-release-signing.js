const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// yatri-release-signing';

// Signs release builds with the Yatri key. The keystore path and passwords come from
// YATRI_UPLOAD_* in ~/.gradle/gradle.properties, so no secret lives in the project.
const block = `
${MARKER}
android {
    if (project.hasProperty('YATRI_UPLOAD_STORE_FILE')) {
        signingConfigs {
            release {
                storeFile file(YATRI_UPLOAD_STORE_FILE)
                storePassword YATRI_UPLOAD_STORE_PASSWORD
                keyAlias YATRI_UPLOAD_KEY_ALIAS
                keyPassword YATRI_UPLOAD_KEY_PASSWORD
            }
        }
        buildTypes.release.signingConfig signingConfigs.release
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('with-release-signing: expected a Groovy app/build.gradle');
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += block;
    }
    return cfg;
  });
};
