import { access, readdir } from "node:fs/promises";
import path from "node:path";

const standaloneRoot = path.join(process.cwd(), ".next", "standalone");
const allowedTopLevelEntries = new Set([
  ".next",
  "node_modules",
  "package.json",
  "public",
  "server.js",
]);
const requiredRuntimeFiles = [
  "server.js",
  path.join(".next", "BUILD_ID"),
  path.join(".next", "server", "app-paths-manifest.json"),
];

for (const relativePath of requiredRuntimeFiles) {
  try {
    await access(path.join(standaloneRoot, relativePath));
  } catch {
    throw new Error(`Standalone artifact is missing required runtime file: ${relativePath}`);
  }
}

const entries = await readdir(standaloneRoot);
const unexpectedEntries = entries
  .filter((entry) => !allowedTopLevelEntries.has(entry))
  .sort();

if (unexpectedEntries.length > 0) {
  throw new Error(
    `Standalone artifact contains unexpected project files: ${unexpectedEntries.join(", ")}`,
  );
}

console.log(
  `Standalone artifact gate passed: ${entries.length} top-level runtime entries checked.`,
);
