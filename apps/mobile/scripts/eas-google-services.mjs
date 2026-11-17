// EAS Build hook (package.json "eas-build-pre-install"): writes google-services.json for Android push (PRD 9)
// from the GOOGLE_SERVICES_JSON environment variable on expo.dev (raw JSON or base64), like the CI job does.
// The file is never committed. Without the variable the build continues without push.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const raw = process.env.GOOGLE_SERVICES_JSON;
if (!raw) {
  console.log('GOOGLE_SERVICES_JSON is not set: building without push.');
  process.exit(0);
}
// An EAS "file" variable holds the path of the file; a "string" variable holds the content.
let text = existsSync(raw) ? readFileSync(raw, 'utf8') : raw;
try {
  JSON.parse(text);
} catch {
  text = Buffer.from(text, 'base64').toString('utf8');
}
const json = JSON.parse(text);
const ok = (json.client ?? []).some((c) => c.client_info?.android_client_info?.package_name === 'com.sanad.hr');
if (!ok) {
  console.error('google-services.json has no com.sanad.hr app');
  process.exit(1);
}
writeFileSync('google-services.json', text);
console.log('google-services.json written for com.sanad.hr');
