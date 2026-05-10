import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const targetRoot = process.argv[2] ?? "dist";

async function copyAsset(source, target) {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

await copyAsset("src/data/api", join(targetRoot, "data/api"));
await copyAsset("src/data/proto", join(targetRoot, "data/proto"));
