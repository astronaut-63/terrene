import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("node_modules/cesium/Build/Cesium");
const destination = resolve("public/cesium");

try {
  await stat(source);
} catch {
  throw new Error("Cesium assets are unavailable. Run npm install before starting or building Terrene.");
}

await mkdir(resolve("public"), { recursive: true });
await rm(destination, { recursive: true, force: true });
// The application bundles Cesium as ESM; do not ship its unused standalone JS bundle.
for (const directory of ['Assets', 'Workers', 'ThirdParty', 'Widgets']) {
  await cp(resolve(source, directory), resolve(destination, directory), { recursive: true });
}
