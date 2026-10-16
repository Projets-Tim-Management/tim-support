/** Une date du fil (retouches, notes, versions) : « 14 oct., 09:30 ». */
export const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
