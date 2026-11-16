/// <reference types="node" />
// Everything is in app.json; this only adds Firebase to the Android build when google-services.json is
// present. The file is never committed (.gitignore): CI writes it from the GOOGLE_SERVICES_JSON secret.
// Without it the APK still builds and runs; the phone just cannot get a push token (PRD 9).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const hasFirebase = existsSync(join(process.cwd(), 'google-services.json'));
  return {
    ...config,
    android: {
      ...config.android,
      ...(hasFirebase ? { googleServicesFile: './google-services.json' } : {}),
    },
  } as ExpoConfig;
};
