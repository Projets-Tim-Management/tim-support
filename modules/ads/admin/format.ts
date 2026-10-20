/** Un montant en euros, à la française : « 12,50 € ». Partagé par les écrans de la publicité. */
export const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
