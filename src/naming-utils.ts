export function toClassName(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, "") + "Service";
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/gi, ($1: string) =>
    $1.toUpperCase().replace("-", "").replace("_", ""),
  );
}

export function toMethodName(operationId: string | undefined): string {
  if (!operationId) return "unknownMethod";
  const parts = operationId.split(":");
  const name = parts[parts.length - 1];
  return name.replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());
}
