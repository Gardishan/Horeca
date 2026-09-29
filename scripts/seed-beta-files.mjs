import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDemoPdf } from "./demo-pdf.mjs";

class BootstrapError extends Error {}

const knownFixtures = new Map([
  ["company-documents/company-active/mock-registration.pdf", "registration"],
  ["company-documents/company-active/mock-bank-details.pdf", "bank details"],
  ["company-documents/company-active/mock-certificate.pdf", "quality certificate"],
  ["company-documents/company-pending/mock-registration-pending.pdf", "registration pending"],
  ["company-documents/company-pending/payment-proof.pdf", "payment proof"],
]);

function legacyPdf(title) {
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% HoReCa KZ seed document: ${title}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
}

function dropRootPrivileges() {
  if (process.getuid?.() !== 0) return;
  try {
    // Railway SSH runs as root even when the application runs as Docker UID 1001.
    process.setgroups([]);
    process.setgid(1001);
    process.setuid(1001);
    if (process.getuid() !== 1001 || process.getgid() !== 1001) throw new Error();
  } catch {
    throw new BootstrapError("Demo file bootstrap could not switch to the application user.");
  }
}

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

async function inspectDirectory(directoryPath) {
  try {
    if (!(await lstat(directoryPath)).isDirectory()) {
      throw new BootstrapError("Demo document directories must not be symlinks.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function inspectFixture(filePath, expected, legacy, repairLegacy) {
  let info;
  try {
    info = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return { state: "missing" };
    throw error;
  }
  if (!info.isFile()) throw new BootstrapError("Existing demo files must be regular files without symlinks.");
  if (info.size === expected.length && (await readFile(filePath)).equals(expected)) {
    return { state: "existing", info };
  }
  if (repairLegacy && info.size === legacy.length && (await readFile(filePath)).equals(legacy)) {
    return { state: "legacy", info };
  }
  throw new BootstrapError("An existing demo file differs from its current fixture; no replacement was made. Exact legacy fixtures require --repair-legacy.");
}

async function replaceLegacy(file) {
  const temporary = path.join(path.dirname(file.destination), `.demo-pdf-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(file.pdf);
    await handle.sync();
    await handle.close();
    handle = undefined;
    const current = await inspectFixture(file.destination, file.pdf, file.legacy, true);
    if (current.state !== "legacy" || current.info.dev !== file.info.dev || current.info.ino !== file.info.ino) {
      throw new BootstrapError("A demo fixture changed during repair; its replacement was refused.");
    }
    await rename(temporary, file.destination);
  } finally {
    if (handle) await handle.close();
    await rm(temporary, { force: true });
  }
}

async function main() {
  dropRootPrivileges();
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--repair-legacy")) {
    throw new BootstrapError("Unsupported demo bootstrap argument.");
  }
  const repairLegacy = args[0] === "--repair-legacy";
  const root = await storageRoot();
  const manifest = JSON.parse(await readFile(new URL("./demo-files.json", import.meta.url), "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new BootstrapError("Invalid demo file manifest.");
  }
  const files = Object.values(manifest);
  const paths = new Set();
  if (files.length !== 5 || files.some((file) => {
    if (!file || !knownFixtures.has(file.storagePath) || knownFixtures.get(file.storagePath) !== file.title || paths.has(file.storagePath)) return true;
    paths.add(file.storagePath);
    return false;
  })) {
    throw new BootstrapError("Invalid demo file manifest.");
  }

  const directories = new Set(files.flatMap((file) => [path.join(root, "company-documents"), path.dirname(path.join(root, file.storagePath))]));
  for (const directoryPath of directories) await inspectDirectory(directoryPath);
  const prepared = [];
  // Validate every candidate before creating directories or replacing any file.
  for (const file of files) {
    const destination = path.join(root, file.storagePath);
    const pdf = createDemoPdf({ title: file.title });
    const legacy = legacyPdf(file.title);
    prepared.push({ destination, pdf, legacy, ...await inspectFixture(destination, pdf, legacy, repairLegacy) });
  }

  let created = 0;
  let existing = 0;
  let repaired = 0;
  for (const directoryPath of directories) await directory(directoryPath);
  for (const file of prepared) {
    if (file.state === "existing") {
      existing += 1;
      continue;
    }
    if (file.state === "legacy") {
      await replaceLegacy(file);
      repaired += 1;
      continue;
    }
    try {
      await writeFile(file.destination, file.pdf, { flag: "wx", mode: 0o600 });
      created += 1;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const current = await inspectFixture(file.destination, file.pdf, file.legacy, false);
      if (current.state !== "existing") throw error;
      existing += 1;
    }
  }
  console.log(JSON.stringify({ event: "beta_demo_files_ready", created, existing, repaired }));
}

main().catch((error) => {
  console.error(error instanceof BootstrapError ? error.message : "Demo file bootstrap failed. Check the mounted volume, permissions and packaged manifest.");
  process.exitCode = 1;
});
