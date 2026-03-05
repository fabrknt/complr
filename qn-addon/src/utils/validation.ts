export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidPlan(plan: string): boolean {
  return ["starter", "pro"].includes(plan);
}

export function requireFields(
  body: Record<string, unknown>,
  fields: string[]
): string | null {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null) {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

export function sanitizeString(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}
