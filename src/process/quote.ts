export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
