import { requireSupplierCompany } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCompanyProduct } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { ProductForm } from "@/components/forms/product-form";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function EditSupplierProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { company } = await requireSupplierCompany(); const { productId } = await params;
  const [product, categories, cities] = await Promise.all([getCompanyProduct(company.id, productId), prisma.productCategory.findMany({ orderBy: { name: "asc" } }), prisma.deliveryCity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })]);
  const defaults = { ...product, price: product.price.toString(), wholesalePrice: product.wholesalePrice?.toString() ?? null };
  return <div className="grid gap-7"><PageHeader eyebrow="Редактирование" title={product.name} description={`SKU ${product.sku}`} actions={<StatusBadge status={product.status} />} /><ProductForm endpoint={`/api/dashboard/products/${product.id}`} method="PUT" categories={categories.map(({ id, name }) => ({ id, name }))} cities={cities.map(({ id, name }) => ({ id, name }))} defaults={defaults} redirectTo="/dashboard/products" /></div>;
}
