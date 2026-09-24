import { z } from "zod";

export const catalogQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  city: z.string().optional(),
  supplierType: z.string().optional(),
  availability: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "PRE_ORDER"]).optional(),
  ),
  page: z.coerce.number().int().default(1).transform((value) => Math.max(value, 1)),
  pageSize: z.coerce.number().int().default(24).transform((value) => Math.min(Math.max(value, 1), 60)),
}).refine(
  // Prisma pagination arguments must fit its signed 32-bit Int input.
  ({ page, pageSize }) => (page - 1) * pageSize <= 2_147_483_647,
  { path: ["page"], message: "Номер страницы слишком большой" },
);
