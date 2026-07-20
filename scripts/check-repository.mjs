import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "out",
  "upload",
]);

function walk(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) return [];
      if (relative === "storage/private/company-documents") {
        return ["storage/private/company-documents/.gitignore"];
      }
      return walk(path.join(directory, entry.name), relative);
    }
    if (
      entry.name.endsWith(".tsbuildinfo") ||
      relative === "sbom.cdx.json" ||
      relative === ".env" ||
      relative === ".env.local" ||
      /^\.env\..+\.local$/.test(relative)
    ) {
      return [];
    }
    return [relative];
  });
}

function projectFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return walk(root).sort();
  }
}

const files = projectFiles();
const fileSet = new Set(files);

const requiredFiles = [
  ".env.example",
  ".node-version",
  ".nvmrc",
  ".npmrc",
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/production-change.yml",
  ".github/dependabot.yml",
  ".github/workflows/quality.yml",
  ".github/workflows/security.yml",
  ".dockerignore",
  "AGENTS.md",
  "Dockerfile",
  "README.md",
  "SECURITY.md",
  "SECURITY_CHECKLIST.md",
  "docs/ARCHITECTURE.md",
  "docs/DEFINITION_OF_DONE.md",
  "docs/DEPLOYMENT.md",
  "docs/ENGINEERING_PLAYBOOK.md",
  "docs/KNOWLEDGE_POLICY.md",
  "docs/PRODUCTION_READINESS.md",
  "docs/PROJECT_CONTEXT.md",
  "docs/RATE_LIMIT_BACKEND.md",
  "docs/SECRETS.md",
  "docs/knowledge/source-registry.json",
  "docs/production-readiness.json",
  "docs/security/advisories.json",
  "prisma/schema.prisma",
  "instrumentation.ts",
  "lib/health.ts",
  "lib/runtime-config.ts",
  "lib/runtime-startup.ts",
  "proxy.ts",
  "scripts/check-readiness.ts",
  "scripts/prepare-standalone.mjs",
  "scripts/check-runtime.mjs",
];

for (const required of requiredFiles) {
  if (!fileSet.has(required)) failures.push(`Отсутствует обязательный файл: ${required}`);
}

const forbiddenExact = new Set([".env", ".env.local", "sbom.cdx.json", "tsconfig.tsbuildinfo"]);
const forbiddenPrefixes = [".next/", "coverage/", "node_modules/", "upload/"];

for (const file of files) {
  if (forbiddenExact.has(file) || forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    failures.push(`В репозиторий попал генерируемый или приватный файл: ${file}`);
  }
  if (
    file.startsWith("storage/private/company-documents/") &&
    file !== "storage/private/company-documents/.gitignore"
  ) {
    failures.push(`Приватный документ отслеживается Git: ${file}`);
  }
  if (file.endsWith(".tsbuildinfo")) failures.push(`TypeScript build info отслеживается Git: ${file}`);

  const absolute = path.join(root, file);
  try {
    if (statSync(absolute).size > 1_000_000) {
      failures.push(`Файл больше 1 МБ требует явного решения: ${file}`);
    }
  } catch {
    failures.push(`Не удалось прочитать отслеживаемый файл: ${file}`);
  }
}

const scanRoots = ["app/", "components/", "lib/", "prisma/", "scripts/", "proxy.ts"];
const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const secretPatterns = [
  { name: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "live Stripe secret", pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
];

for (const file of files) {
  if (!scanRoots.some((prefix) => file.startsWith(prefix))) continue;
  if (!sourceExtensions.has(path.extname(file))) continue;
  if (file === "scripts/check-repository.mjs") continue;

  const content = readFileSync(path.join(root, file), "utf8");
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) failures.push(`Похожее на ${name} значение найдено в ${file}`);
  }
  if (/\bdangerouslySetInnerHTML\b/.test(content)) {
    failures.push(`Небезопасный HTML rendering требует отдельного review: ${file}`);
  }
  if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(content)) {
    failures.push(`Динамическое исполнение кода запрещено: ${file}`);
  }
}

if (fileSet.has(".env.example")) {
  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
  for (const name of [
    "APP_ENV",
    "DEPLOYMENT_VERSION",
    "DATABASE_URL",
    "AUTH_SECRET",
    "APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "PRIVATE_STORAGE_ROOT",
    "DEMO_AUTH_ENABLED",
    "RATE_LIMIT_MODE",
    "RATE_LIMIT_ALLOW_IN_MEMORY",
    "RATE_LIMIT_BACKEND_URL",
    "RATE_LIMIT_BACKEND_TOKEN",
  ]) {
    if (!new RegExp(`^${name}=`, "m").test(envExample)) {
      failures.push(`.env.example не документирует ${name}`);
    }
  }
  if (!/^RATE_LIMIT_ALLOW_IN_MEMORY="?false"?$/m.test(envExample)) {
    failures.push(".env.example не должен разрешать in-memory rate limit в production");
  }
  if (!/^APP_ENV="?development"?$/m.test(envExample)) {
    failures.push(".env.example должен использовать development APP_ENV");
  }
}

if (fileSet.has("package.json")) {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  for (const script of [
    "build",
    "check:readiness",
    "check:repo",
    "check:runtime",
    "check:unused",
    "lint",
    "release:check",
    "runtime:validate",
    "security:sbom",
    "test:coverage",
    "typecheck",
    "verify",
  ]) {
    if (!packageJson.scripts?.[script]) failures.push(`package.json не содержит script ${script}`);
  }
  if (packageJson.engines?.node !== ">=22 <23") {
    failures.push("package.json должен закреплять поддерживаемую Node.js 22.x ветку");
  }
  if (packageJson.scripts?.start !== "node .next/standalone/server.js") {
    failures.push("package.json start должен запускать проверенный standalone server");
  }
  if (packageJson.overrides?.postcss !== "8.5.19") {
    failures.push("package.json должен закреплять исправленный PostCSS 8.5.19 до обновления Next.js dependency graph");
  }
}

for (const runtimePin of [".nvmrc", ".node-version"]) {
  if (fileSet.has(runtimePin) && readFileSync(path.join(root, runtimePin), "utf8").trim() !== "22") {
    failures.push(`${runtimePin} должен закреплять Node.js 22`);
  }
}

if (
  fileSet.has(".npmrc") &&
  !/^engine-strict=true$/m.test(readFileSync(path.join(root, ".npmrc"), "utf8"))
) {
  failures.push(".npmrc должен запрещать установку на неподдерживаемом Node.js runtime");
}

if (fileSet.has(".github/dependabot.yml")) {
  const dependabot = readFileSync(path.join(root, ".github/dependabot.yml"), "utf8");
  if (
    !/dependency-name:\s*["']\*["'][\s\S]*update-types:[\s\S]*version-update:semver-major/.test(
      dependabot,
    )
  ) {
    failures.push(
      "Dependabot должен оставлять major version updates для отдельного совместимого migration PR",
    );
  }
}

if (fileSet.has("docs/knowledge/source-registry.json")) {
  try {
    const registry = JSON.parse(
      readFileSync(path.join(root, "docs/knowledge/source-registry.json"), "utf8"),
    );
    if (registry.version !== 1 || !Array.isArray(registry.sources) || registry.sources.length === 0) {
      failures.push("Knowledge source registry имеет неподдерживаемую структуру");
    }
  } catch {
    failures.push("Knowledge source registry содержит невалидный JSON");
  }
}

if (fileSet.has("docs/security/advisories.json")) {
  try {
    const advisories = JSON.parse(
      readFileSync(path.join(root, "docs/security/advisories.json"), "utf8"),
    );
    if (
      advisories.version !== 1 ||
      !Array.isArray(advisories.exceptions) ||
      advisories.exceptions.some(
        (item) => !item.id || !item.owner || !item.reviewBy || !Array.isArray(item.mitigations),
      )
    ) {
      failures.push("Security advisory registry имеет неподдерживаемую структуру");
    }
  } catch {
    failures.push("Security advisory registry содержит невалидный JSON");
  }
}

const migrations = files.filter((file) => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(file));
if (migrations.length === 0) failures.push("Нет воспроизводимой Prisma migration");

if (failures.length > 0) {
  console.error("Repository gate failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Repository gate passed: ${files.length} files checked, ${migrations.length} migration(s) found.`);
}
