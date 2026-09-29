import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  navigate: vi.fn(),
  setters: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const setter = vi.fn();
    mocks.setters.push(setter);
    return [initial, setter];
  },
}));

import { BetaAccessForm } from "@/components/forms/beta-access-form";
import { BuyerRequestForm } from "@/components/forms/buyer-request-form";

function prepareForm(kind: "invite" | "buyer") {
  const body = new FormData();
  const fields = kind === "invite"
    ? { accessToken: "synthetic-invite-token-over-32-characters" }
    : { buyerName: "Demo Buyer", buyerCompany: "Demo Company", phone: "+70000000000", email: "qa@example.test", quantity: "3", message: "Synthetic buyer request", website: "" };
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  vi.stubGlobal("FormData", vi.fn(function () { return body; }));
  const form = { reset: vi.fn() };
  const event = { preventDefault: vi.fn(), currentTarget: form };
  const component = kind === "invite"
    ? BetaAccessForm({ nextPath: "/catalog?city=almaty" })
    : BuyerRequestForm({ productId: "product-1", productName: "Demo product" });
  return {
    form, event, body, fields,
    submit: component.props.onSubmit as (event: unknown) => Promise<void>,
    pending: mocks.setters[0],
    error: mocks.setters[kind === "invite" ? 1 : 2],
    success: kind === "buyer" ? mocks.setters[1] : undefined,
  };
}

describe.each(["invite", "buyer"] as const)("%s form recovery", (kind) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setters.length = 0;
    vi.stubGlobal("window", { location: { replace: mocks.navigate } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["network", "non-json"])("preserves input and restores submission after a %s failure without retrying", async (failure) => {
    const fetchMock = failure === "network"
      ? vi.fn().mockRejectedValue(new Error("private network diagnostic"))
      : vi.fn().mockResolvedValue(new Response("<html>Provider unavailable</html>", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { submit, event, pending, error, form, body, fields, success } = prepareForm(kind);

    await expect(submit(event)).resolves.toBeUndefined();

    expect(pending).toHaveBeenNthCalledWith(1, true);
    expect(pending).toHaveBeenLastCalledWith(false);
    expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Не удалось получить ответ сервера"));
    if (kind === "buyer") expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Заявка могла быть отправлена"));
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/private network diagnostic|<html>/);
    expect(form.reset).not.toHaveBeenCalled();
    expect(Object.fromEntries(body)).toEqual(fields);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    if (success) expect(success).not.toHaveBeenCalled();
  });

  it("shows the API rejection and keeps the entered values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: { message: "Демонстрационный отказ" } }, { status: 422 })));
    const { submit, event, pending, error, form, success } = prepareForm(kind);

    await submit(event);

    expect(error).toHaveBeenLastCalledWith("Демонстрационный отказ");
    expect(pending).toHaveBeenLastCalledWith(false);
    expect(form.reset).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    if (success) expect(success).not.toHaveBeenCalled();
  });

  it("stays pending until the response arrives and completes the existing success action once", async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetchMock);
    const { submit, event, pending, error, success } = prepareForm(kind);

    const result = submit(event);
    expect(pending).toHaveBeenLastCalledWith(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolve(Response.json({ ok: true, data: { id: "synthetic-result" } }));
    await result;

    expect(pending).toHaveBeenLastCalledWith(false);
    expect(error).toHaveBeenCalledExactlyOnceWith("");
    if (kind === "invite") {
      // The anonymous page can have cached a denied prefetch of this path.
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith("/catalog?city=almaty");
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ accessToken: "synthetic-invite-token-over-32-characters" });
    } else {
      expect(success).toHaveBeenCalledExactlyOnceWith(true);
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ productId: "product-1", quantity: 3, website: "" });
    }
  });
});
