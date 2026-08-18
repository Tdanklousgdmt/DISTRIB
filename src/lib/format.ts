/** Formate une taille de fichier en octets vers l'unité la plus lisible. */
export function formatBytes(bytes: bigint): string {
  const units = ["o", "Ko", "Mo", "Go"];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
