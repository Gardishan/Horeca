import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

class BootstrapError extends Error {}

async function storageRoot() {
  if (process.env.APP_ENV !== "beta" || process.env.BETA_DEMO_ONLY !== "true" || process.env.BETA_ENABLED !== "false") {
    throw new BootstrapError("Demo file bootstrap requires disabled, demo-only Beta.");
  }
  const root = process.env.PRIVATE_STORAGE_ROOT;
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!root || !volume || !path.isAbsolute(root) || !path.isAbsolute(volume)) {
    throw new BootstrapError("Demo file bootstrap requires an explicit mounted volume and absolute private storage root.");
  }
  const [rootInfo, volumeInfo] = await Promise.all([lstat(root), lstat(volume)]);
  if (!rootInfo.isDirectory() || !volumeInfo.isDirectory()) {
    throw new BootstrapError("Private storage and volume must be real directories without symlinks.");
  }
  const [resolvedRoot, resolvedVolume] = await Promise.all([realpath(root), realpath(volume)]);
  if (resolvedRoot !== resolvedVolume) {
    throw new BootstrapError("Private storage must use the mounted volume root.");
  }
  return resolvedRoot;
}

async function directory(directoryPath) {
  try {
    await mkdir(directoryPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  if (!(await lstat(directoryPath)).isDirectory()) {
    throw new BootstrapError("Demo document directories must not be symlinks.");
  }
}

async function existingFixture(filePath, expected) {
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isFile()) throw new BootstrapError("Existing demo files must be regular files without symlinks.");
  if (info.size !== expected.length || !(await readFile(filePath)).equals(expected)) {
    throw new BootstrapError("An existing demo file differs from its fixture; no existing file was overwritten.");
  }
  return true;
}

async function main() {
  const root = await storageRoot();
  const manifest = JSON.parse(await readFile(new URL("./demo-files.json", import.meta.url), "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new BootstrapError("Invalid demo file manifest.");
  }
  const files = Object.values(manifest);
  const paths = new Set();
  if (files.length !== 5 || files.some((file) => {
    if (!file || typeof file.storagePath !== "string" || !/^company-documents\/company-(active|pending)\/[a-z0-9-]+\.pdf$/.test(file.storagePath) || typeof file.title !== "string" || !/^[a-z ]{1,80}$/.test(file.title) || paths.has(file.storagePath)) return true;
    paths.add(file.storagePath);
    return false;
  })) {
    throw new BootstrapError("Invalid demo file manifest.");
  }

  let created = 0;
  let existing = 0;
  for (const file of files) {
    const destination = path.join(root, file.storagePath);
    await directory(path.join(root, "company-documents"));
    await directory(path.dirname(destination));
    const pdf = Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% HoReCa KZ seed document: ${file.title}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
    if (await existingFixture(destination, pdf)) {
      existing += 1;
      continue;
    }
    try {
      await writeFile(destination, pdf, { flag: "wx", mode: 0o600 });
      created += 1;
    } catch (error) {
      if (error?.code !== "EEXIST" || !await existingFixture(destination, pdf)) throw error;
      existing += 1;
    }
  }
  console.log(JSON.stringify({ event: "beta_demo_files_ready", created, existing }));
}

main().catch((error) => {
  console.error(error instanceof BootstrapError ? error.message : "Demo file bootstrap failed. Check the mounted volume, permissions and packaged manifest.");
  process.exitCode = 1;
});
