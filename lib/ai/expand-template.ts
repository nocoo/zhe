export function expandTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key: string) => {
    if (!(key in vars)) return match;
    return vars[key] ?? match;
  });
}
