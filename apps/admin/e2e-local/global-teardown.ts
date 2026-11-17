import { rmSync } from "node:fs";
import path from "node:path";
import { localServiceClient } from "./local-env";
import { cleanUpSmoke } from "./seed";

export default async function globalTeardown() {
  await cleanUpSmoke(localServiceClient());
  rmSync(path.resolve(__dirname, ".auth"), { recursive: true, force: true });
}
