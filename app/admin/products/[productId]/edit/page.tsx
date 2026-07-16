import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/forms/product-form";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function EditAdminProductPage({ params }: { params: Promise<{ productId: string }> }) {
  await requireRole("ADMIN"); const { productId } = await params;
  const [product, categories, cities] = await Promise.all([prisma.product.findUnique({ where: { id: productId }, include: { company: { select: { name: true } } } }), prisma.productCategory.findMany({ orderBy: { name: "asc" } }), prisma.deliveryCity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })]);
  if (!product) throw new NotFoundError("Товар не найден"); const defaults = { ...product, price: product.price.toString(), wholesalePrice: product.wholesalePrice?.toString() ?? null };
  return <div className="grid gap-7"><PageHeader eyebrow={`Поставщик · ${product.company.name}`} title={product.name} description={`SKU ${product.sku}`} actions={<StatusBadge status={product.status} />} /><ProductForm endpoint={`/api/admin/products/${product.id}`} method="PUT" categories={categories.map(({ id, name }) => ({ id, name }))} cities={cities.map(({ id, name }) => ({ id, name }))} defaults={defaults} redirectTo="/admin/products" /></div>;
}
