// Однократная ротация пароля demo-администратора после db:seed.
// Запуск из корня репозитория с выставленным DATABASE_URL:
//   node scratchpad/rotate-demo-admin.mjs
// Пароль печатается ОДИН раз в stdout. Сохраните его и очистите скроллбек.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const email = process.env.DEMO_ADMIN_EMAIL ?? "admin@horeca.kz";
const password = process.env.DEMO_ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!existing) throw new Error(`Пользователь ${email} не найден — сид не выполнялся?`);
  if (existing.role !== "ADMIN") throw new Error(`${email} не является ADMIN — отказ`);

  await prisma.user.update({
    where: { email },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  console.log("");
  console.log("  Пароль администратора обновлён.");
  console.log(`  email:  ${email}`);
  console.log(`  пароль: ${password}`);
  console.log("");
  console.log("  Пароли supplier@horeca.kz и pending@horeca.kz остались demo123 —");
  console.log("  это намеренно: они нужны для прохода сценариев поставщика.");
  console.log("");
} finally {
  await prisma.$disconnect();
}
