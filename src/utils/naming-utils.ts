export function toClassName(str: string): string {
  const cleaned = str.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + "Service";
}

export function capitalize(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toCamelCase(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str.replace(/([-_][a-z])/gi, ($1: string) =>
    $1.toUpperCase().replace("-", "").replace("_", ""),
  );
}

export function toPascalCase(str: string): string {
  if (!str || typeof str !== "string") return "";
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function toKebabCase(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function toSnakeCase(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export function toLowerCase(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase();
}

export function toUpperCase(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str.toUpperCase();
}

export function toMethodName(operationId: string | undefined): string {
  if (!operationId) return "unknownMethod";
  const parts = operationId.split(":");
  const name = parts[parts.length - 1];
  return name.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());
}
