import { requireSupplierCompany } from "@/lib/auth";
import { getVerificationContext } from "@/lib/services/verification";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { VerificationPanel } from "@/components/forms/verification-panel";
import { LEGAL_VERSION } from "@/lib/constants";

export default async function VerificationPage() {
  const { company } = await requireSupplierCompany();
  const data = await getVerificationContext(company.id);
  const documents = data.documents.map((item) => ({ id: item.id, type: item.type, originalName: item.originalName, status: item.status, adminComment: item.adminComment }));
  return <div className="grid gap-7"><PageHeader eyebrow="Trust & Safety" title="Верификация поставщика" description="Примите юридические документы, загрузите реквизиты и отправьте компанию на ручную проверку." actions={<StatusBadge status={data.verificationStatus} />} /><VerificationPanel acceptedTypes={data.legalAcceptances.filter((item) => item.version === LEGAL_VERSION).map((item) => item.type)} documents={documents} /></div>;
}

