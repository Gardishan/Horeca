import { z } from "zod";

const optionalUrl = z.union([z.url(), z.literal("")]).optional().nullable().transform((value) => value || null);
const phone = z.string().trim().min(7).max(30);

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(128),
});

export const supplierRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  companyName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180),
  binIin: z.string().trim().regex(/^\d{12}$/, "БИН/ИИН должен содержать 12 цифр"),
  address: z.string().trim().min(5).max(240),
  city: z.string().trim().min(2).max(80),
  phone,
});

export const companyProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180),
  binIin: z.string().trim().regex(/^\d{12}$/, "БИН/ИИН должен содержать 12 цифр"),
  address: z.string().trim().min(5).max(240),
  city: z.string().trim().min(2).max(80),
  deliveryCities: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
  categories: z.array(z.string().trim().min(2).max(100)).min(1).max(30),
  description: z.string().trim().min(40).max(4000),
  phone,
  email: z.email(),
  whatsapp: z.string().trim().max(80).optional().nullable(),
  telegram: z.string().trim().max(80).optional().nullable(),
  instagram: z.string().trim().max(120).optional().nullable(),
  website: optionalUrl.nullable(),
  logoUrl: optionalUrl.nullable(),
  bannerUrl: optionalUrl.nullable(),
});

export const legalAcceptanceSchema = z.object({
  type: z.enum(["OFFER", "PRIVACY", "SUPPLIER_VERIFICATION", "REFUND_POLICY"]),
  accepted: z.literal(true),
});

export const planSelectionSchema = z.object({ planCode: z.enum(["START", "PRO", "PREMIUM"]) });

export const markPaidSchema = z.object({ invoiceId: z.string().min(1) });

export const productSchema = z.object({
  name: z.string().trim().min(3).max(180),
  sku: z.string().trim().min(2).max(80),
  categoryId: z.string().min(1),
  description: z.string().trim().min(30).max(6000),
  price: z.coerce.number().positive().max(1_000_000_000),
  wholesalePrice: z.coerce.number().positive().max(1_000_000_000).optional().nullable(),
  currency: z.enum(["KZT", "USD"]).default("KZT"),
  unit: z.enum(["KG", "LITER", "PIECE", "BOX", "BAG", "PACKAGE"]),
  moq: z.coerce.number().int().positive().max(1_000_000),
  stock: z.coerce.number().int().nonnegative().max(1_000_000_000),
  availabilityStatus: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "PRE_ORDER"]),
  city: z.string().trim().min(2).max(80),
  deliveryCities: z.array(z.string().trim().min(2).max(80)).min(1).max(30),
  leadTimeDays: z.coerce.number().int().min(0).max(365),
  imageUrl: optionalUrl.nullable(),
  isFeatured: z.boolean().default(false),
});

export const buyerRequestSchema = z.object({
  productId: z.string().min(1),
  buyerName: z.string().trim().min(2).max(120),
  buyerCompany: z.string().trim().min(2).max(160),
  phone,
  email: z.email(),
  message: z.string().trim().min(10).max(2000),
  quantity: z.coerce.number().int().positive().max(10_000_000),
  website: z.string().max(0).optional(),
});

export const adminDecisionSchema = z.object({
  comment: z.string().trim().max(2000).optional().default(""),
});

export const adminCompanySchema = companyProfileSchema.partial().extend({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "ACTIVE", "BLOCKED", "REJECTED"]).optional(),
  verificationStatus: z.enum(["NOT_STARTED", "PENDING", "APPROVED", "REJECTED", "REUPLOAD_REQUESTED"]).optional(),
  isRecommended: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
});
