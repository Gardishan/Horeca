import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), pathname: "/dashboard/requests" }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  redirect: vi.fn(() => { throw new Error("Unexpected redirect"); }),
}));

import DashboardLayout from "@/app/dashboard/layout";
import AdminLayout from "@/app/admin/layout";
import { AppSidebar } from "@/components/ui/app-sidebar";

describe("server layout navigation serialization", () => {
  it("passes cloneable supplier navigation across the client boundary and renders the inbox", async () => {
    mocks.getCurrentUser.mockResolvedValue({ role: "SUPPLIER" });
    const layout = await DashboardLayout({ children: "Supplier content" });
    const sidebar = layout.props.children[0];

    expect(sidebar.type).toBe(AppSidebar);
    expect(() => structuredClone(sidebar.props.items)).not.toThrow();
    const html = renderToStaticMarkup(sidebar);
    expect(html).toContain('href="/dashboard/requests"');
    expect(html).toContain("Заявки покупателей");
    expect(html).toContain("lucide-inbox");
    expect(html).toContain('href="/dashboard/company/billing"');
  });

  it("passes cloneable administrator navigation across the client boundary", async () => {
    mocks.getCurrentUser.mockResolvedValue({ role: "ADMIN" });
    mocks.pathname = "/admin";
    const layout = await AdminLayout({ children: "Admin content" });
    const sidebar = layout.props.children[0];

    expect(sidebar.type).toBe(AppSidebar);
    expect(() => structuredClone(sidebar.props.items)).not.toThrow();
    const html = renderToStaticMarkup(sidebar);
    expect(html).toContain('href="/admin/verifications"');
    expect(html).toContain('href="/admin/company"');
    expect(html).toContain("lucide-building2");
    expect(html).toContain("Администрирование");
  });
});
