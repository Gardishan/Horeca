import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
  state: new Map<number, unknown>(),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = mocks.setters.length;
    const setState = vi.fn();
    mocks.setters.push(setState);
    return [mocks.state.has(index) ? mocks.state.get(index) : initial, setState];
  },
}));

import { BuyerRequestForm } from "@/components/forms/buyer-request-form";

const PENDING = 0;
const SUCCESS = 1;
const ERROR = 2;
const FIELD_ERRORS = 3;

type ElementProps = Record<string, unknown> & {
  children?: ReactNode;
  name?: string;
  onSubmit?: (event: unknown) => Promise<void>;
};

function collect(node: ReactNode, found: ReactElement<ElementProps>[] = []) {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ElementProps>(child)) continue;
    found.push(child);
    collect(child.props.children, found);
  }
  return found;
}

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (typeof child === "string" || typeof child === "number"
      ? String(child)
      : isValidElement<ElementProps>(child) ? textOf(child.props.children) : ""))
    .join("");
}

function render(props: Partial<Parameters<typeof BuyerRequestForm>[0]> = {}) {
  mocks.setters.length = 0;
  const root = BuyerRequestForm({ productId: "product-coffee", productName: "Demo Coffee", ...props });
  const elements = collect(root);
  const field = (name: string) => {
    const element = elements.find((candidate) => candidate.props.name === name);
    if (!element) throw new Error(`Field ${name} is missing`);
    return element.props;
  };
  return { root, elements, field };
}

function prepareSubmit(props: Partial<Parameters<typeof BuyerRequestForm>[0]> = {}, acknowledged = false) {
  const body = new FormData();
  body.set("buyerName", "Demo Buyer");
  body.set("buyerCompany", "Demo Cafe");
  body.set("phone", "+77010000000");
  body.set("email", "buyer@example.test");
  body.set("quantity", "10");
  body.set("message", "Прошу направить демонстрационное предложение.");
  body.set("website", "");
  if (acknowledged) body.set("betaDemoAcknowledged", "true");
  vi.stubGlobal("FormData", vi.fn(function () { return body; }));
  const { elements } = render(props);
  const submit = elements.find((element) => element.type === "form")?.props.onSubmit;
  if (!submit) throw new Error("Buyer request form is missing");
  const event = { preventDefault: vi.fn(), currentTarget: {} };
  return { submit, event };
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("buyer request form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setters.length = 0;
    mocks.state.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mirrors buyerRequestSchema constraints and defaults quantity to the product MOQ", () => {
    const { field, root } = render({ defaultQuantity: 10, unitLabel: "кг" });

    expect(field("buyerName")).toMatchObject({ required: true, minLength: 2, maxLength: 120 });
    expect(field("buyerCompany")).toMatchObject({ required: true, minLength: 2, maxLength: 160 });
    expect(field("phone")).toMatchObject({ required: true, type: "tel", minLength: 7, maxLength: 30 });
    expect(field("email")).toMatchObject({ required: true, type: "email" });
    expect(field("quantity")).toMatchObject({ required: true, min: 1, max: 10_000_000, step: 1, defaultValue: 10 });
    expect(field("message")).toMatchObject({ required: true, minLength: 10, maxLength: 2000 });
    expect(textOf(root)).toContain("Количество, кг");
  });

  it("keeps the regular contact copy and no Beta checkbox outside Beta", () => {
    const { elements, root } = render();

    expect(elements.some((element) => element.props.name === "betaDemoAcknowledged")).toBe(false);
    expect(textOf(root)).toContain("Контакты используются только для ответа на B2B-заявку.");
  });

  it("requires a synthetic-contacts acknowledgement in a demo-only Beta", () => {
    const { field, root } = render({ betaDemoOnly: true });

    expect(field("betaDemoAcknowledged")).toMatchObject({ type: "checkbox", value: "true", required: true });
    expect(textOf(root)).toMatch(/вымышленные/);
    expect(textOf(root)).not.toContain("Контакты используются только для ответа");
  });

  it.each([
    [false, false],
    [true, true],
  ])("sends the request (Beta demo-only: %s) and shows success", async (betaDemoOnly, acknowledged) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: "request-1" } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { submit, event } = prepareSubmit({ betaDemoOnly }, acknowledged);

    await submit(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    const body = sentBody(fetchMock);
    expect(body).toMatchObject({ productId: "product-coffee", phone: "+77010000000", quantity: 10 });
    if (betaDemoOnly) expect(body.betaDemoAcknowledged).toBe(true);
    else expect(body).not.toHaveProperty("betaDemoAcknowledged");
    expect(mocks.setters[SUCCESS]).toHaveBeenLastCalledWith(true);
    expect(mocks.setters[PENDING]).toHaveBeenLastCalledWith(false);
  });

  it.each(["network", "non-json"])("recovers the submit button and explains a %s failure", async (failure) => {
    vi.stubGlobal("fetch", failure === "network"
      ? vi.fn().mockRejectedValue(new Error("internal network diagnostic"))
      : vi.fn().mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } })));
    const { submit, event } = prepareSubmit();

    await submit(event);

    expect(mocks.setters[PENDING]).toHaveBeenLastCalledWith(false);
    expect(mocks.setters[ERROR]).toHaveBeenLastCalledWith(expect.stringMatching(/соединени/));
    expect(JSON.stringify(mocks.setters[ERROR].mock.calls)).not.toContain("internal network diagnostic");
    expect(JSON.stringify(mocks.setters[ERROR].mock.calls)).not.toContain("Bad Gateway");
    expect(mocks.setters[SUCCESS]).not.toHaveBeenCalled();
  });

  it("maps validation details to per-field hints without exposing raw validator text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Проверьте заполненные поля",
        details: [
          { code: "too_small", path: ["phone"], message: "Too small: expected string to have >=7 characters" },
          { code: "invalid_type", path: ["productId"], message: "Invalid input" },
          { code: "custom", path: ["constructor"], message: "Prototype key" },
        ],
      },
    }, { status: 422 })));
    const { submit, event } = prepareSubmit();

    await submit(event);

    expect(mocks.setters[FIELD_ERRORS]).toHaveBeenLastCalledWith({ phone: expect.stringMatching(/от 7 до 30/) });
    expect(mocks.setters[ERROR]).toHaveBeenLastCalledWith("Проверьте заполненные поля");
    expect(JSON.stringify(mocks.setters[FIELD_ERRORS].mock.calls)).not.toContain("Too small");
    expect(mocks.setters[PENDING]).toHaveBeenLastCalledWith(false);
    expect(mocks.setters[SUCCESS]).not.toHaveBeenCalled();
  });

  it("shows the server message when an error carries no field details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      ok: false,
      error: { code: "BETA_DEMO_CONTACT_REQUIRED", message: "Подтвердите, что заявка содержит только вымышленные демонстрационные контакты" },
    }, { status: 422 })));
    const { submit, event } = prepareSubmit({ betaDemoOnly: true });

    await submit(event);

    expect(mocks.setters[ERROR]).toHaveBeenLastCalledWith(expect.stringMatching(/вымышленные/));
    expect(mocks.setters[FIELD_ERRORS]).toHaveBeenLastCalledWith({});
    expect(mocks.setters[PENDING]).toHaveBeenLastCalledWith(false);
  });

  it("marks only the failing field invalid and links it to its hint", () => {
    mocks.state.set(ERROR, "Проверьте заполненные поля");
    mocks.state.set(FIELD_ERRORS, { phone: "Укажите телефон от 7 до 30 символов" });

    const { elements, field } = render();

    expect(field("phone")).toMatchObject({ "aria-invalid": true, "aria-describedby": "buyer-request-phone-error" });
    const hint = elements.find((element) => element.props.id === "buyer-request-phone-error");
    expect(hint && textOf(hint.props.children)).toBe("Укажите телефон от 7 до 30 символов");
    expect(field("email")).not.toHaveProperty("aria-invalid");
  });

  it("disables the submit button while the request is pending", () => {
    mocks.state.set(PENDING, true);

    const { elements } = render();

    const button = elements.find((element) => element.props.type === "submit");
    expect(button?.props.disabled).toBe(true);
    expect(textOf(button?.props.children)).toContain("Отправляем");
  });
});
