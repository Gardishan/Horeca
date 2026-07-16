import { requireSupplierCompany } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { CompanyProfileForm } from "@/components/forms/company-profile-form";

export default async function CompanyProfilePage() {
  const { company } = await requireSupplierCompany();
  const profile = { name: company.name, legalName: company.legalName, binIin: company.binIin, address: company.address, city: company.city, deliveryCities: company.deliveryCities, categories: company.categories, description: company.description, phone: company.phone, email: company.email, whatsapp: company.whatsapp, telegram: company.telegram, instagram: company.instagram, website: company.website, logoUrl: company.logoUrl, bannerUrl: company.bannerUrl };
  return <div className="grid gap-7"><PageHeader eyebrow="Компания" title="Профиль поставщика" description="Эти данные используются при верификации и формируют карточку поставщика в публичном каталоге." /><CompanyProfileForm company={profile} /></div>;
}

