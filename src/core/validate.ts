export function validateArgs(schema: any, args: unknown): string[] {
  const a: any = args ?? {};
  if (typeof a !== "object" || Array.isArray(a))
    return ["args must be an object"];

  const errors: string[] = [];
  for (const key of schema?.required ?? []) {
    if (a[key] === undefined) errors.push(`missing ${key}`);
  }
  for (const [key, def] of Object.entries<any>(schema?.properties ?? {})) {
    const v = a[key];
    if (v === undefined) continue;
    if (def.type === "string" && typeof v !== "string")
      errors.push(`${key} must be a string`);
    if (def.type === "number" && typeof v !== "number")
      errors.push(`${key} must be a number`);
    if (def.type === "boolean" && typeof v !== "boolean")
      errors.push(`${key} must be a boolean`);
    if (def.enum && !def.enum.includes(v))
      errors.push(`${key} must be one of ${def.enum.join(", ")}`);
  }
  return errors;
}
