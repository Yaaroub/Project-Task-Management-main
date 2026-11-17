// Shared by server and browser: order statuses and the totals calculation.
export const VAT_RATES = [19, 7, 0];
export const ORDER_STATUS = [
  { id: "anfrage", label: "Anfrage", color: "var(--slate)" },
  { id: "angebot", label: "Angebot", color: "var(--fjord)" },
  { id: "beauftragt", label: "Beauftragt", color: "var(--brass)" },
  { id: "in_arbeit", label: "In Arbeit", color: "var(--warn)" },
  { id: "erledigt", label: "Erledigt", color: "var(--ok)" },
  { id: "abgerechnet", label: "Abgerechnet", color: "var(--moss)" },
  { id: "abgelehnt", label: "Abgelehnt", color: "var(--err)" },
];
export const ORDER_STATUS_IDS = ORDER_STATUS.map(s => s.id);
export const statusMeta = id => ORDER_STATUS.find(s => s.id === id) || ORDER_STATUS[0];
// Orders that still bring work or money (pipeline value on the dashboard).
export const OPEN_STATUSES = ["angebot", "beauftragt", "in_arbeit", "erledigt"];

const round2 = n => Math.round(n * 100) / 100;

// Net, VAT per rate and gross. Always recomputed on the server; the browser uses it for live preview.
export function orderTotals(items = []) {
  const byRate = {};
  let net = 0;
  for (const i of items) {
    const line = round2((Number(i.qty) || 0) * (Number(i.price) || 0));
    net += line;
    byRate[i.vat] = round2((byRate[i.vat] || 0) + line);
  }
  const vat = Object.entries(byRate).map(([rate, base]) => ({ rate: Number(rate), base, amount: round2(base * Number(rate) / 100) }))
    .filter(v => v.rate > 0).sort((a, b) => b.rate - a.rate);
  const vatSum = round2(vat.reduce((s, v) => s + v.amount, 0));
  return { net: round2(net), vat, vatSum, gross: round2(net + vatSum) };
}
