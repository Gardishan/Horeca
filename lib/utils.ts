const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  қ: "q", ғ: "g", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split("")
    .map((character) => CYRILLIC_MAP[character] ?? character)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function uniqueSlug(value: string) {
  const base = slugify(value) || "item";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export function toPlainNumber(value: { toNumber(): number } | number | null | undefined) {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : value.toNumber();
}

export function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

