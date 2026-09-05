/** Formate un délai écoulé depuis une date, en français, de façon lisible. */
export function delaiEcouleDepuis(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const jours = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "il y a 1 jour";
  if (jours < 30) return `il y a ${jours} jours`;

  const mois = Math.floor(jours / 30);
  if (mois === 1) return "il y a 1 mois";
  if (mois < 12) return `il y a ${mois} mois`;

  const annees = Math.floor(mois / 12);
  return annees === 1 ? "il y a 1 an" : `il y a ${annees} ans`;
}
