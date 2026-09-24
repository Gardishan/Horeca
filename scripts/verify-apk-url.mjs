import { execFileSync } from "node:child_process";
import path from "node:path";

function readArchive(args) {
  try {
    return execFileSync("unzip", args, {
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Unable to read APK archive within verification limits");
  }
}

// Read only the string table, not arbitrary byte/resource matches. ASCII origins
// have identical UTF-8/MUTF-8 bytes. DEX layout: https://source.android.com/docs/core/runtime/dex-format
function hasUrlConstant(dex, expected) {
  const invalid = () => new Error("Invalid or unsupported DEX string table");
  if (dex.length < 112 || !/^dex\n(?:035|037|038|039|040)\0$/.test(dex.subarray(0, 8).toString("ascii"))
    || dex.readUInt32LE(32) !== dex.length || dex.readUInt32LE(36) !== 112
    || dex.readUInt32LE(40) !== 0x12345678) throw invalid();

  const count = dex.readUInt32LE(56);
  const table = dex.readUInt32LE(60);
  if ((count && table < 112) || table + count * 4 > dex.length) throw invalid();
  let found = false;
  for (let index = 0; index < count; index += 1) {
    let offset = dex.readUInt32LE(table + index * 4);
    if (offset < 112 || offset >= dex.length) throw invalid();
    let utf16Length = 0;
    for (let byteIndex = 0; ; byteIndex += 1) {
      if (byteIndex === 5 || offset >= dex.length) throw invalid();
      const byte = dex[offset++];
      if (byteIndex === 4 && byte > 0x0f) throw invalid();
      utf16Length += (byte & 0x7f) * 2 ** (byteIndex * 7);
      if (!(byte & 0x80)) break;
    }
    const end = dex.indexOf(0, offset);
    if (end === -1) throw invalid();
    if (utf16Length === expected.length && dex.subarray(offset, end).equals(expected)) found = true;
  }
  return found;
}

try {
  const [apkPath, expectedUrl, ...extra] = process.argv.slice(2);
  if (!apkPath || extra.length) throw new Error("Usage: node scripts/verify-apk-url.mjs <apk> <expected-origin>");
  let origin;
  try {
    origin = new URL(expectedUrl);
  } catch {
    throw new Error("Expected an HTTP(S) origin");
  }
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== expectedUrl) {
    throw new Error("Expected an HTTP(S) origin");
  }

  const archive = path.resolve(apkPath);
  const members = readArchive(["-Z1", archive]).toString("utf8").split(/\r?\n/)
    .filter((name) => /^classes(?:[2-9]|[1-9][0-9]+)?\.dex$/.test(name));
  if (!members.length) throw new Error("No root classes DEX files in APK");
  const matches = [];
  const expected = Buffer.from(expectedUrl, "ascii");
  for (const member of members) {
    if (hasUrlConstant(readArchive(["-p", archive, member]), expected)) matches.push(member);
  }
  if (!matches.length) throw new Error("Expected URL constant was not found in APK DEX files");
  console.log(`APK URL verified in ${matches.join(", ")}; scanned ${members.length} DEX files.`);
} catch (error) {
  console.error(`APK URL verification failed: ${error.message}`);
  process.exitCode = 1;
}
