import { access, readFile, readdir, realpath } from "node:fs/promises";
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

// Server chunks load externalized packages through hashed aliases such as
// require("@prisma/client-2c3a283f134fdcb6"). Every alias must resolve to a
// package inside the artifact: the runtime image contains nothing else, so a
// missing or outward-pointing alias passes liveness and fails every request that
// touches the database or private storage.
const hashedExternal = /require\("((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+-[0-9a-f]{16})"\)/g;
const artifactRoot = await realpath(standaloneRoot);

async function listJavaScript(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await listJavaScript(entryPath)));
    else if (entry.name.endsWith(".js")) found.push(entryPath);
  }
  return found;
}

const externalAliases = new Set();
for (const chunk of await listJavaScript(path.join(standaloneRoot, ".next", "server"))) {
  for (const match of (await readFile(chunk, "utf8")).matchAll(hashedExternal)) {
    externalAliases.add(match[1]);
  }
}

const aliasFailures = [];
for (const alias of [...externalAliases].sort()) {
  const aliasPath = path.join(standaloneRoot, ".next", "node_modules", alias);
  try {
    const resolved = await realpath(aliasPath);
    if (resolved !== artifactRoot && !resolved.startsWith(`${artifactRoot}${path.sep}`)) {
      aliasFailures.push(`${alias} resolves outside the artifact`);
      continue;
    }
    await access(path.join(resolved, "package.json"));
  } catch {
    aliasFailures.push(`${alias} does not resolve to a package inside the artifact`);
  }
}

try {
  await access(path.join(standaloneRoot, "node_modules", ".prisma", "client", "default.js"));
} catch {
  aliasFailures.push("generated Prisma client node_modules/.prisma/client is missing");
}

if (aliasFailures.length > 0) {
  throw new Error(`Standalone artifact cannot load its external modules:\n- ${aliasFailures.join("\n- ")}`);
}

console.log(
  `Standalone artifact gate passed: ${entries.length} top-level runtime entries and ${externalAliases.size} external module aliases checked.`,
);
