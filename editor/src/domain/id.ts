// Geração de ids curtos, usados por parse/templates/mutations do domínio.
export function uid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 7);
}

export function newDocId(): string {
  return uid('doc') + Date.now().toString(36);
}
