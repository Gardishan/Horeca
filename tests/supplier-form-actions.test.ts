import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), setters: [] as ReturnType<typeof vi.fn>[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const setState = vi.fn();
    mocks.setters.push(setState);
    return [initial, setState];
  },
}));

import { VerificationPanel } from "@/components/forms/verification-panel";
import { BillingPanel } from "@/components/forms/billing-panel";

type ElementProps = { children?: ReactNode; disabled?: boolean; onClick?: () => Promise<void>; onSubmit?: (event: unknown) => Promise<void> };

function uploadForm(node: ReactNode): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (child.type === "form" && child.props.onSubmit) return child;
    const match = uploadForm(child.props.children);
    if (match) return match;
  }
}

function actionButton(node: ReactNode): ReactElement<ElementProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ElementProps>(child)) continue;
    if (child.props.onClick && !child.props.disabled) return child;
    const match = actionButton(child.props.children);
    if (match) return match;
  }
}

function prepareUpload(kind: "document" | "payment" = "document") {
  const form = { reset: vi.fn() };
  const body = new FormData();
  body.set("demoMaterialAcknowledged", "true");
  vi.stubGlobal("FormData", vi.fn(function () { return body; }));
  const event = { preventDefault: vi.fn(), currentTarget: form as typeof form | null };
  const panel = kind === "document"
    ? VerificationPanel({ acceptedTypes: [], documents: [], betaDemoOnly: true })
    : BillingPanel({
      plans: [],
      pendingSubscription: { id: "subscription-1", planCode: "PRO" },
      invoices: [{ id: "invoice-1", subscriptionId: "subscription-1", invoiceNumber: "HKZ-1", amount: "10000", currency: "KZT", status: "ISSUED", payments: [] }],
      betaDemoOnly: true,
    });
  const submit = uploadForm(panel)?.props.onSubmit;
  if (!submit) throw new Error("Upload form is missing");
  return { form, event, submit, body };
}

describe("supplier form recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setters.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("resets the captured document form and refreshes after React clears the event target", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: "document-1" } })));
    const { form, event, submit } = prepareUpload();

    const result = submit(event);
    event.currentTarget = null;
    await result;

    expect(form.reset).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.setters[0]).toHaveBeenLastCalledWith("");
  });

  it.each(["network", "non-json"])("restores the document upload form after a %s failure", async (failure) => {
    const fetchMock = failure === "network"
      ? vi.fn().mockRejectedValue(new Error("internal network diagnostic"))
      : vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { form, event, submit } = prepareUpload();

    await submit(event);

    expect(mocks.setters[0]).toHaveBeenLastCalledWith("");
    expect(mocks.setters[1]).toHaveBeenLastCalledWith(expect.objectContaining({ error: true, text: expect.any(String) }));
    expect(JSON.stringify(mocks.setters[1].mock.calls)).not.toContain("internal network diagnostic");
    expect(form.reset).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("preserves document input and displays a rejected upload without refreshing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: { message: "Документ отклонён" } }, { status: 422 })));
    const { form, event, submit } = prepareUpload();

    await submit(event);

    expect(mocks.setters[0]).toHaveBeenLastCalledWith("");
    expect(mocks.setters[1]).toHaveBeenLastCalledWith({ error: true, text: "Документ отклонён" });
    expect(form.reset).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("uploads the selected invoice proof with the demo acknowledgment and resets the captured form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true, data: { hasProof: true } })));
    const { form, event, submit, body } = prepareUpload("payment");

    const result = submit(event);
    event.currentTarget = null;
    await result;

    expect(body.get("invoiceId")).toBe("invoice-1");
    expect(body.get("demoMaterialAcknowledged")).toBe("true");
    expect(form.reset).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.setters[0]).toHaveBeenLastCalledWith("");
  });

  it("restores the payment upload controls after a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal diagnostic")));
    const { form, event, submit } = prepareUpload("payment");

    await submit(event);

    expect(mocks.setters[0]).toHaveBeenLastCalledWith("");
    expect(mocks.setters[2]).toHaveBeenLastCalledWith(true);
    expect(form.reset).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(["billing", "verification"])("restores %s controls after a failed JSON action", async (kind) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal diagnostic")));
    const panel = kind === "billing"
      ? BillingPanel({ plans: [], invoices: [], pendingSubscription: { id: "subscription-1", planCode: "PRO" } })
      : VerificationPanel({ acceptedTypes: ["OFFER", "PRIVACY"], documents: [] });
    const click = actionButton(panel)?.props.onClick;
    if (!click) throw new Error("Action button is missing");

    await click();

    expect(mocks.setters[0]).toHaveBeenLastCalledWith("");
    expect(mocks.refresh).not.toHaveBeenCalled();
    if (kind === "billing") expect(mocks.setters[2]).toHaveBeenLastCalledWith(true);
    else expect(mocks.setters[1]).toHaveBeenLastCalledWith(expect.objectContaining({ error: true }));
  });
});
