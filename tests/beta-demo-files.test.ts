import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDemoPdf } from "../scripts/demo-pdf.mjs";

const expectedFiles = [
  ["company-documents/company-active/mock-registration.pdf", "registration"],
  ["company-documents/company-active/mock-bank-details.pdf", "bank details"],
  ["company-documents/company-active/mock-certificate.pdf", "quality certificate"],
  ["company-documents/company-pending/mock-registration-pending.pdf", "registration pending"],
  ["company-documents/company-pending/payment-proof.pdf", "payment proof"],
] as const;

describe("controlled Beta demo file bootstrap", () => {
  let directory: string;
  let volume: string;
  let script: string;
  let environment: NodeJS.ProcessEnv;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "horeca-beta-files-"));
    volume = path.join(directory, "volume");
    const bundle = path.join(directory, "beta-bootstrap");
    await mkdir(volume);
    await mkdir(bundle);
    script = path.join(bundle, "seed-beta-files.mjs");
    await copyFile("scripts/seed-beta-files.mjs", script);
    await copyFile("scripts/demo-pdf.mjs", path.join(bundle, "demo-pdf.mjs"));
    await copyFile("prisma/demo-files.json", path.join(bundle, "demo-files.json"));
    environment = {
      ...process.env,
      APP_ENV: "beta", BETA_DEMO_ONLY: "true", BETA_ENABLED: "false",
      PRIVATE_STORAGE_ROOT: volume, RAILWAY_VOLUME_MOUNT_PATH: volume,
    };
  });
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  function run(overrides: Record<string, string | undefined> = {}, args: string[] = []) {
    return spawnSync(process.execPath, [script, ...args], { env: { ...environment, ...overrides }, encoding: "utf8" });
  }

  function legacyPdf(title: string) {
    return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% HoReCa KZ seed document: ${title}\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
  }

  async function writeLegacyFixtures() {
    for (const [storagePath, title] of expectedFiles) {
      const file = path.join(volume, storagePath);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, legacyPdf(title), { mode: 0o600 });
    }
  }

  function runWithIdentity(options: { uid: number; gid: number; failAt?: "setgroups" | "setgid" | "setuid"; retainRoot?: boolean }) {
    const harness = `
      const fs = require("node:fs/promises");
      const { syncBuiltinESMExports } = require("node:module");
      const { pathToFileURL } = require("node:url");
      const options = ${JSON.stringify(options)};
      let uid = options.uid;
      let gid = options.gid;
      let groups = [20, 100];
      const events = [];
      process.getuid = () => uid;
      process.getgid = () => gid;
      process.setgroups = (value) => {
        events.push({ action: "setgroups", groups: value });
        if (options.failAt === "setgroups") throw new Error("Simulated group reset failure");
        groups = [...value];
      };
      process.setgid = (value) => {
        events.push({ action: "setgid", id: value });
        if (options.failAt === "setgid") throw new Error("Simulated GID switch failure");
        gid = value;
      };
      process.setuid = (value) => {
        events.push({ action: "setuid", id: value });
        if (options.failAt === "setuid") throw new Error("Simulated UID switch failure");
        if (!options.retainRoot) uid = value;
      };
      for (const action of ["mkdir", "writeFile"]) {
        const original = fs[action];
        fs[action] = (...args) => {
          events.push({ action, uid, gid, groups: [...groups] });
          return original(...args);
        };
      }
      syncBuiltinESMExports();
      process.on("exit", () => console.log(JSON.stringify({ event: "bootstrap_identity_trace", events })));
      import(pathToFileURL(process.argv[1]).href).catch(() => { process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, ["-e", harness, script], { env: environment, encoding: "utf8" });
    const traceLine = result.stdout.split("\n").find((line) => line.startsWith('{"event":"bootstrap_identity_trace"'));
    expect(traceLine, result.stderr).toBeDefined();
    return { ...result, events: JSON.parse(traceLine!).events as Array<Record<string, unknown>> };
  }

  it("drops root groups, GID and UID before creating private fixture directories or files", async () => {
    const result = runWithIdentity({ uid: 0, gid: 0 });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"created":5');
    expect(result.events.slice(0, 3)).toEqual([
      { action: "setgroups", groups: [] },
      { action: "setgid", id: 1001 },
      { action: "setuid", id: 1001 },
    ]);
    const writes = result.events.filter(({ action }) => action === "mkdir" || action === "writeFile");
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) expect(write).toMatchObject({ uid: 1001, gid: 1001, groups: [] });
    expect((await lstat(path.join(volume, "company-documents"))).mode & 0o777).toBe(0o700);
    for (const [storagePath] of expectedFiles) expect((await lstat(path.join(volume, storagePath))).mode & 0o777).toBe(0o600);
  });

  it("preserves the identity of a non-root local fixture invocation", () => {
    const result = runWithIdentity({ uid: 501, gid: 20 });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"created":5');
    expect(result.events.some(({ action }) => ["setgroups", "setgid", "setuid"].includes(String(action)))).toBe(false);
    for (const write of result.events) expect(write).toMatchObject({ uid: 501, gid: 20, groups: [20, 100] });
  });

  it.each(["setgroups", "setgid", "setuid"] as const)("refuses every file mutation when %s fails", async (failAt) => {
    const result = runWithIdentity({ uid: 0, gid: 0, failAt });

    expect(result.status).not.toBe(0);
    expect(result.events.at(-1)?.action).toBe(failAt);
    expect(result.events.some(({ action }) => action === "mkdir" || action === "writeFile")).toBe(false);
    expect(await readdir(volume)).toEqual([]);
    expect(`${result.stdout}${result.stderr}`).not.toContain("Simulated");
  });

  it("refuses file mutations if the process remains root after the UID switch", async () => {
    const result = runWithIdentity({ uid: 0, gid: 0, retainRoot: true });

    expect(result.status).not.toBe(0);
    expect(result.events.some(({ action }) => action === "mkdir" || action === "writeFile")).toBe(false);
    expect(await readdir(volume)).toEqual([]);
  });

  it("creates the five exact synthetic PDFs and preserves files on repeated execution", async () => {
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain('"created":5');
    const initialMtimes = [];
    for (const [storagePath, title] of expectedFiles) {
      const file = path.join(volume, storagePath);
      expect(await readFile(file)).toEqual(createDemoPdf({ title }));
      const stats = await lstat(file);
      expect(stats.mode & 0o777).toBe(0o600);
      initialMtimes.push(stats.mtimeMs);
    }
    const unrelated = path.join(volume, "existing-upload.pdf");
    await writeFile(unrelated, "existing private file");

    const second = run();

    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('"created":0');
    expect(second.stdout).toContain('"existing":5');
    expect(await readFile(unrelated, "utf8")).toBe("existing private file");
    expect(await Promise.all(expectedFiles.map(async ([storagePath]) => (await lstat(path.join(volume, storagePath))).mtimeMs))).toEqual(initialMtimes);
  });

  it("creates a document page with a page tree instead of a PDF-looking placeholder", async () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    const pdf = await readFile(path.join(volume, expectedFiles[0][0]), "utf8");
    expect(pdf).toContain("/Type /Pages");
    expect(pdf).toContain("/Type /Page ");
    expect(pdf).toContain("DEMO ONLY");
    expect(pdf).toMatch(/\nxref\n/);
    expect(pdf).toMatch(/\nstartxref\n\d+\n%%EOF\n$/);
  });

  it("requires explicit permission to replace exact legacy placeholders", async () => {
    await writeLegacyFixtures();
    const result = run();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--repair-legacy");
    for (const [storagePath, title] of expectedFiles) {
      expect(await readFile(path.join(volume, storagePath))).toEqual(legacyPdf(title));
    }
  });

  it("atomically repairs exact legacy fixtures and does not touch the repaired files on repeat", async () => {
    await writeLegacyFixtures();
    const originalInodes = await Promise.all(expectedFiles.map(async ([storagePath]) => (await lstat(path.join(volume, storagePath))).ino));
    const first = run({}, ["--repair-legacy"]);

    expect(first.status, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ created: 0, existing: 0, repaired: 5 });
    const mtimes = [];
    for (const [index, [storagePath, title]] of expectedFiles.entries()) {
      const file = path.join(volume, storagePath);
      expect(await readFile(file)).toEqual(createDemoPdf({ title }));
      const stats = await lstat(file);
      expect(stats.ino).not.toBe(originalInodes[index]);
      expect(stats.mode & 0o777).toBe(0o600);
      mtimes.push(stats.mtimeMs);
      expect((await readdir(path.dirname(file))).some((name) => name.startsWith(".demo-pdf-"))).toBe(false);
    }

    const second = run({}, ["--repair-legacy"]);
    expect(second.status, second.stderr).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ created: 0, existing: 5, repaired: 0 });
    expect(await Promise.all(expectedFiles.map(async ([storagePath]) => (await lstat(path.join(volume, storagePath))).mtimeMs))).toEqual(mtimes);
  });

  it("supports a mixed set of current, legacy and absent fixtures", async () => {
    await writeLegacyFixtures();
    await writeFile(path.join(volume, expectedFiles[0][0]), createDemoPdf({ title: expectedFiles[0][1] }));
    await rm(path.join(volume, expectedFiles[4][0]));

    const result = run({}, ["--repair-legacy"]);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ created: 1, existing: 1, repaired: 3 });
  });

  it.each(["unknown", "symlink"])("preflights all legacy candidates before any replacement when the last file is %s", async (kind) => {
    await writeLegacyFixtures();
    const firstFile = path.join(volume, expectedFiles[0][0]);
    const before = await lstat(firstFile);
    const lastFile = path.join(volume, expectedFiles[4][0]);
    const outsideFile = path.join(directory, "unrelated.pdf");
    await writeFile(outsideFile, "must remain untouched");
    if (kind === "unknown") await writeFile(lastFile, "not a known fixture");
    else { await rm(lastFile); await symlink(outsideFile, lastFile); }

    const result = run({}, ["--repair-legacy"]);

    expect(result.status).not.toBe(0);
    expect(await readFile(firstFile)).toEqual(legacyPdf(expectedFiles[0][1]));
    expect((await lstat(firstFile)).mtimeMs).toBe(before.mtimeMs);
    expect((await lstat(firstFile)).ino).toBe(before.ino);
    expect(await readFile(outsideFile, "utf8")).toBe("must remain untouched");
    if (kind === "unknown") expect(await readFile(lastFile, "utf8")).toBe("not a known fixture");
    else expect((await lstat(lastFile)).isSymbolicLink()).toBe(true);
  });

  it.each([{ APP_ENV: "production" }, { BETA_ENABLED: "true" }, { BETA_DEMO_ONLY: "false" }])("does not let the repair flag bypass the environment guard: %j", async (overrides) => {
    await writeLegacyFixtures();
    expect(run(overrides, ["--repair-legacy"]).status).not.toBe(0);
    for (const [storagePath, title] of expectedFiles) {
      expect(await readFile(path.join(volume, storagePath))).toEqual(legacyPdf(title));
    }
  });

  it("rejects unexpected arguments before creating any files", async () => {
    expect(run({}, ["--repair-all"]).status).not.toBe(0);
    expect(await readdir(volume)).toEqual([]);
  });

  it.each([
    { APP_ENV: "development" }, { APP_ENV: "staging" }, { APP_ENV: "production" },
    { BETA_DEMO_ONLY: "false" }, { BETA_ENABLED: "true" }, { BETA_ENABLED: "" },
    { RAILWAY_VOLUME_MOUNT_PATH: "" }, { PRIVATE_STORAGE_ROOT: "" },
    { PRIVATE_STORAGE_ROOT: "relative/path" },
  ])("refuses an unsafe environment: %j", async (overrides) => {
    const result = run(overrides);

    expect(result.status).not.toBe(0);
    expect(await readdir(volume)).toEqual([]);
    expect(`${result.stdout}${result.stderr}`).not.toContain(volume);
  });

  it("requires an existing volume and matching private storage root", async () => {
    const other = path.join(directory, "other");
    await mkdir(other);
    expect(run({ PRIVATE_STORAGE_ROOT: other }).status).not.toBe(0);
    expect(run({ PRIVATE_STORAGE_ROOT: path.join(directory, "missing"), RAILWAY_VOLUME_MOUNT_PATH: path.join(directory, "missing") }).status).not.toBe(0);
    expect(await readdir(volume)).toEqual([]);
    expect(await readdir(other)).toEqual([]);
  });

  it("rejects altered existing fixture contents without overwriting them", async () => {
    execFileSync(process.execPath, [script], { env: environment });
    const file = path.join(volume, expectedFiles[0][0]);
    await writeFile(file, "different existing content");

    expect(run().status).not.toBe(0);
    expect(await readFile(file, "utf8")).toBe("different existing content");
  });

  it.each(["root", "directory", "file"])("refuses a symlink at the %s boundary", async (boundary) => {
    const outside = path.join(directory, "outside");
    await mkdir(outside);
    const outsideFile = path.join(outside, "outside.pdf");
    await writeFile(outsideFile, "untouched");
    if (boundary === "root") {
      const alias = path.join(directory, "alias");
      await symlink(volume, alias);
      environment.PRIVATE_STORAGE_ROOT = alias;
      environment.RAILWAY_VOLUME_MOUNT_PATH = alias;
    } else if (boundary === "directory") {
      await symlink(outside, path.join(volume, "company-documents"));
    } else {
      const file = path.join(volume, expectedFiles[0][0]);
      await mkdir(path.dirname(file), { recursive: true });
      await symlink(outsideFile, file);
    }

    expect(run().status).not.toBe(0);
    expect(await readFile(outsideFile, "utf8")).toBe("untouched");
    expect(await readdir(outside)).toEqual(["outside.pdf"]);
  });

  it("rejects unsafe manifest paths before writing files", async () => {
    await writeFile(path.join(path.dirname(script), "demo-files.json"), JSON.stringify({ bad: { storagePath: "../escaped.pdf", title: "escape" } }));

    expect(run().status).not.toBe(0);
    expect(await readdir(volume)).toEqual([]);
  });

  it("rejects a well-formed path outside the five fixed fixture identities", async () => {
    const manifest = JSON.parse(await readFile(path.join(path.dirname(script), "demo-files.json"), "utf8"));
    manifest.activeRegistration.storagePath = "company-documents/company-active/other.pdf";
    await writeFile(path.join(path.dirname(script), "demo-files.json"), JSON.stringify(manifest));

    expect(run({}, ["--repair-legacy"]).status).not.toBe(0);
    expect(await readdir(volume)).toEqual([]);
  });
});
