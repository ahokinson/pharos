export function commandExists(bin: string): boolean {
  return Bun.which(bin) !== null;
}
