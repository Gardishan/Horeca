import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = path.resolve("scripts/verify-apk-url.mjs");
const origin = "https://beta.example.test";

// Minimal DEX string-table fixtures; Android execution/signing is outside this check.
function dex(strings: string[]) {
  const data = strings.map((value) => {
    const length = [];
    let remaining = value.length;
    do {
      const byte = remaining & 0x7f;
      remaining >>>= 7;
      length.push(byte | (remaining ? 0x80 : 0));
    } while (remaining);
    return Buffer.concat([Buffer.from(length), Buffer.from(value), Buffer.from([0])]);
  });
  const dataOffset = 112 + strings.length * 4;
  const buffer = Buffer.alloc(dataOffset + data.reduce((size, value) => size + value.length, 0));
  buffer.write("dex\n038\0");
  buffer.writeUInt32LE(buffer.length, 32);
  buffer.writeUInt32LE(112, 36);
  buffer.writeUInt32LE(0x12345678, 40);
  buffer.writeUInt32LE(strings.length, 56);
  buffer.writeUInt32LE(strings.length ? 112 : 0, 60);
  let offset = dataOffset;
  data.forEach((value, index) => {
    buffer.writeUInt32LE(offset, 112 + index * 4);
    value.copy(buffer, offset);
    offset += value.length;
  });
  return buffer;
}

describe("APK configured URL verification", () => {
  let directory: string;
  let apk: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "horeca-apk-test-"));
    apk = path.join(directory, "app with spaces.apk");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function archive(entries: Record<string, Buffer | string>) {
    const contents = path.join(directory, "contents");
    await mkdir(contents);
    for (const [name, bytes] of Object.entries(entries)) {
      const file = path.join(contents, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    execFileSync("zip", ["-q", "-r", apk, "."], { cwd: contents });
  }

  function run(expected = origin) {
    return spawnSync(process.execPath, [script, apk, expected], { encoding: "utf8", timeout: 10_000 });
  }

  it.each(["classes.dex", "classes2.dex", "classes10.dex"])("finds the exact constant in %s", async (member) => {
    await archive({ "classes.dex": dex(["other"]), [member]: dex(["a".repeat(200), origin]) });

    const result = run();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(member);
  });

  it.each(["https://other.example.test", `${origin}.evil`, `${origin}/different-path`])("rejects wrong URL %s", async (wrongUrl) => {
    await archive({ "classes.dex": dex([wrongUrl]) });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Expected URL constant was not found");
  });

  it("ignores resource matches, nested DEX files, and unreferenced DEX bytes", async () => {
    const content = dex(["other"]);
    const withUnreferencedUrl = Buffer.concat([content, Buffer.from(`${origin}\0`)]);
    withUnreferencedUrl.writeUInt32LE(withUnreferencedUrl.length, 32);
    await archive({
      "classes.dex": withUnreferencedUrl,
      "assets/config.txt": origin,
      "assets/classes2.dex": dex([origin]),
      "resources.arsc": origin,
    });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Expected URL constant was not found");
  });

  it("rejects an APK with no root DEX entries", async () => {
    await archive({ "resources.arsc": origin });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No root classes DEX files");
  });

  it("fails when a later DEX is truncated even after a matching constant", async () => {
    await archive({ "classes.dex": dex([origin]), "classes2.dex": Buffer.from("dex\n038\0") });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid or unsupported DEX string table");
  });

  it("fails on an out-of-bounds string table", async () => {
    const content = dex([origin]);
    content.writeUInt32LE(content.length, 60);
    await archive({ "classes.dex": content });

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid or unsupported DEX string table");
  });

  it("fails safely for unreadable/corrupt APKs", async () => {
    for (const content of [undefined, "not a zip"]) {
      if (content) await writeFile(apk, content);
      const result = run();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Unable to read APK archive");
      expect(result.stderr).not.toContain(directory);
    }
  });

  it("rejects a missing expected URL instead of matching an empty string", async () => {
    await archive({ "classes.dex": dex([origin]) });

    const result = run("");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Expected an HTTP(S) origin");
  });
});
