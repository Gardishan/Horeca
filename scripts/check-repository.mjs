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
  ".github/workflows/quality.yml",
  "AGENTS.md",
  "README.md",
  "SECURITY.md",
  "SECURITY_CHECKLIST.md",
  "docs/ARCHITECTURE.md",
  "docs/ENGINEERING_PLAYBOOK.md",
  "docs/PROJECT_CONTEXT.md",
  "prisma/schema.prisma",
];

for (const required of requiredFiles) {
  if (!fileSet.has(required)) failures.push(`Отсутствует обязательный файл: ${required}`);
}

const forbiddenExact = new Set([".env", ".env.local", "tsconfig.tsbuildinfo"]);
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

const scanRoots = ["app/", "components/", "lib/", "prisma/", "scripts/"];
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
    "DATABASE_URL",
    "AUTH_SECRET",
    "APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "PRIVATE_STORAGE_ROOT",
  ]) {
    if (!new RegExp(`^${name}=`, "m").test(envExample)) {
      failures.push(`.env.example не документирует ${name}`);
    }
  }
}

if (fileSet.has("package.json")) {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  for (const script of ["build", "check:repo", "lint", "test:coverage", "typecheck", "verify"]) {
    if (!packageJson.scripts?.[script]) failures.push(`package.json не содержит script ${script}`);
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
