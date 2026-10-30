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
await cp(source, destination, { recursive: true });
