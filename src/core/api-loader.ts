import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { API_FILE_NAMES, type ApiEndpoint, type ApiFile, type ApiFileName } from "./types.js";
import { BilibiliAPIError } from "./errors.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data/api");
const API_FILES: ApiFileName[] = [...API_FILE_NAMES];
const cache = new Map<ApiFileName, Promise<ApiFile>>();
const require = createRequire(import.meta.url);

export function listApiFiles(): ApiFileName[] {
  return [...API_FILES];
}

export async function loadApiFile(name: ApiFileName): Promise<ApiFile> {
  if (!API_FILES.includes(name)) {
    throw endpointError(`未知 API 文件：${name}`);
  }
  if (!cache.has(name)) {
    cache.set(name, readFile(resolve(DATA_DIR, `${name}.json`), "utf8").then((content) => JSON.parse(content)));
  }
  return cache.get(name)!;
}

export function clearApiCache(): void {
  cache.clear();
}

export async function getEndpointAsync(
  file: ApiFileName,
  group: string,
  endpoint: string,
): Promise<ApiEndpoint> {
  const apiFile = await loadApiFile(file);
  const selected = apiFile[group]?.[endpoint];
  if (!selected) {
    throw endpointError(`未知 API endpoint：${file}.${group}.${endpoint}`);
  }
  return selected;
}

export function getEndpoint(file: ApiFileName, group: string, endpoint: string): ApiEndpoint {
  const apiFile = loadApiFileSync(file);
  const selected = apiFile[group]?.[endpoint];
  if (!selected) {
    throw endpointError(`未知 API endpoint：${file}.${group}.${endpoint}`);
  }
  return selected;
}

function loadApiFileSync(name: ApiFileName): ApiFile {
  const fs = require("node:fs") as typeof import("node:fs");
  return JSON.parse(fs.readFileSync(resolve(DATA_DIR, `${name}.json`), "utf8")) as ApiFile;
}

function endpointError(message: string): BilibiliAPIError {
  return new BilibiliAPIError(message, "BILIBILI_ENDPOINT_INVALID", undefined, undefined, false, "请检查 API catalog。");
}
