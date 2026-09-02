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

/** « il y a 2 h », « hier · 10:40 », « lun. · 22:10 » — comme l'historique du prototype. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  if (h < 48) return `hier · ${time}`;
  if (h < 24 * 7) return `${date.toLocaleDateString("fr-FR", { weekday: "short" })} · ${time}`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Formate une durée en secondes vers "m:ss" ou "h:mm:ss". */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
