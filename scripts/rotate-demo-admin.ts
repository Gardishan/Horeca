// Однократная ротация пароля demo-администратора после db:seed.
// Запуск из корня репозитория с DATABASE_URL, указывающим на базу
// контролируемой Beta или локального демо-стенда:
//   npm run db:rotate-admin
// Пароль печатается ОДИН раз в stdout. Сохраните его и очистите скроллбек.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertDemoSeedAllowed } from "../lib/runtime-config";

// Ротируется учётная запись из demo-сида, поэтому действует то же ограничение
// среды, что и для самого сида: в staging и production операция запрещена.
assertDemoSeedAllowed(process.env);

const email = process.env.DEMO_ADMIN_EMAIL ?? "admin@horeca.kz";
const password = process.env.DEMO_ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (!existing) throw new Error(`Пользователь ${email} не найден — сид не выполнялся?`);
  if (existing.role !== "ADMIN") throw new Error(`${email} не является ADMIN — отказ`);

  // Роль повторно проверяется в самом запросе: между чтением и записью она могла
  // измениться, и понижённая учётная запись не должна получить новый пароль.
  const { count } = await prisma.user.updateMany({
    where: { id: existing.id, role: "ADMIN" },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  if (count !== 1) throw new Error(`${email} изменился во время ротации — пароль не обновлён`);

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
