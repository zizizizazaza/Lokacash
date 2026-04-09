
export function stripInternalResearchCitations(text: string): string {
  if (!text) return text;
  return text.replace(/\s*\(([RWX]\d+(?:\s*,\s*[RWX]\d+)*)\)/g, '');
}
