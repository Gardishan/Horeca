import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const markerPath = process.env.BETA_MARKER_PATH ?? "";
const resultPath = process.env.BETA_PERSISTENCE_RESULT_PATH ?? "";
const phase = process.env.BETA_PERSISTENCE_PHASE ?? "unspecified";

if (!markerPath) throw new Error("BETA_MARKER_PATH is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const marker = JSON.parse(await readFile(markerPath, "utf8"));
if (typeof marker.id !== "string" || typeof marker.label !== "string") {
  throw new Error("Persistence marker file is invalid");
}

const prisma = new PrismaClient();
try {
  const row = await prisma.buyerRequest.findUnique({
    where: { id: marker.id },
    select: { id: true, buyerCompany: true, createdAt: true },
  });
  if (!row || row.buyerCompany !== marker.label) {
    throw new Error("Exact PostgreSQL persistence marker was not found");
  }

  const result = {
    ok: true,
    phase,
    markerId: row.id,
    markerLabelSha256: createHash("sha256").update(row.buyerCompany).digest("hex"),
    createdAt: row.createdAt.toISOString(),
    verifiedAt: new Date().toISOString(),
  };
  if (resultPath) await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
