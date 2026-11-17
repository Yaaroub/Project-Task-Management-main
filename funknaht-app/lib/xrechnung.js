import "server-only";
import { HttpError } from "./db";

/*
 * E-Rechnung im Format XRechnung 3.0 (Syntax UN/CEFACT CII, Norm EN 16931), erzeugt aus dem
 * eingefrorenen Stand einer gestellten Rechnung. Vor dem ersten produktiven Versand an Behörden
 * mit dem KoSIT-Validator prüfen (https://github.com/itplr-kosit/validator).
 */
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const amt = n => (Math.round(n * 100) / 100).toFixed(2);
const qty = n => String(Math.round(n * 10000) / 10000);
const d102 = s => String(s).slice(0, 10).replace(/-/g, "");
const date = s => `<udt:DateTimeString format="102">${d102(s)}</udt:DateTimeString>`;
const round2 = n => Math.round(n * 100) / 100;

// UN/ECE Rec. 20 unit codes for common German units.
const UNITS = [[/^(std\.?|stunden?|h)$/i, "HUR"], [/^(stk\.?|stück|st\.?)$/i, "H87"], [/^(pauschal|psch\.?|pausch\.?|pauschale)$/i, "LS"],
  [/^m$/i, "MTR"], [/^(m²|m2|qm)$/i, "MTK"], [/^(m³|m3|cbm)$/i, "MTQ"], [/^kg$/i, "KGM"], [/^(l|liter)$/i, "LTR"], [/^(tag|tage)$/i, "DAY"], [/^km$/i, "KMT"]];
const unitCode = unit => UNITS.find(([re]) => re.test(String(unit || "").trim()))?.[1] || "C62";

function taxRegistration(taxId) {
  const compact = String(taxId).replace(/\s/g, "").toUpperCase();
  return /^DE\d{9}$/.test(compact) ? `<ram:ID schemeID="VA">${esc(compact)}</ram:ID>` : `<ram:ID schemeID="FC">${esc(taxId)}</ram:ID>`;
}

const category = (rate, small) => (small ? "E" : rate > 0 ? "S" : "Z");

// buyerEmail: current address of the customer, used if none was stored when the invoice was issued
// (the electronic address only routes the e-invoice, it is not part of the invoice content).
export function buildXRechnung(inv, { buyerEmail = "" } = {}) {
  if (!inv.issued) throw new HttpError(409, "Eine E-Rechnung gibt es erst für gestellte Rechnungen.");
  const { seller, items, smallBusiness, buyerReference } = inv.snapshot;
  const buyer = { ...inv.snapshot.buyer, email: inv.snapshot.buyer.email || buyerEmail };
  const missing = [];
  if (!seller.iban) missing.push("IBAN (Firmendaten)");
  if (!seller.phone) missing.push("Telefon (Firmendaten)");
  if (!seller.email) missing.push("E-Mail (Firmendaten)");
  if (!buyer.email) missing.push(`E-Mail des Kunden ${buyer.number}`);
  if (missing.length) throw new HttpError(409, `Für die XRechnung fehlt: ${missing.join(", ")}. Hinweis: Die Angaben werden beim Stellen eingefroren – bei bereits gestellten Rechnungen bitte stornieren und neu stellen.`);

  // Tax groups including 0 % (the totals on paper only list rates above 0).
  const groups = {};
  for (const i of items) {
    const line = round2(i.qty * i.price);
    groups[i.vat] = round2((groups[i.vat] || 0) + line);
  }
  const taxes = Object.entries(groups).map(([rate, base]) => ({ rate: Number(rate), base, amount: round2(base * Number(rate) / 100) }));
  const lineTotal = round2(taxes.reduce((s, t) => s + t.base, 0));
  const taxTotal = round2(taxes.reduce((s, t) => s + t.amount, 0));
  const grand = round2(lineTotal + taxTotal);
  const exemption = "Kleinunternehmer gemäß § 19 UStG";
  const notes = [
    smallBusiness && "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
    inv.snapshot.propertyNotice && "Sie sind gesetzlich verpflichtet, diese Rechnung zwei Jahre aufzubewahren (§ 14b Abs. 1 Satz 5 UStG).",
    inv.note,
  ].filter(Boolean);

  const party = (p, contactName, phone, email) => `
        <ram:Name>${esc(p.name)}</ram:Name>${contactName || phone || email ? `
        <ram:DefinedTradeContact>${contactName ? `
          <ram:PersonName>${esc(contactName)}</ram:PersonName>` : ""}${phone ? `
          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ""}${email ? `
          <ram:EmailURIUniversalCommunication><ram:URIID>${esc(email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ""}
        </ram:DefinedTradeContact>` : ""}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.street)}</ram:LineOne>
          <ram:CityName>${esc(p.city)}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(email || p.email)}</ram:URIID></ram:URIUniversalCommunication>`;

  const lines = items.map((i, n) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${n + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(i.title)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(i.price)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${unitCode(i.unit)}">${qty(i.qty)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${category(i.vat, smallBusiness)}</ram:CategoryCode>
          <ram:RateApplicablePercent>${i.vat}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(i.qty * i.price)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join("");

  const taxXml = taxes.map(t => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amt(t.amount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${smallBusiness ? `
        <ram:ExemptionReason>${esc(exemption)}</ram:ExemptionReason>` : ""}
        <ram:BasisAmount>${amt(t.base)}</ram:BasisAmount>
        <ram:CategoryCode>${category(t.rate, smallBusiness)}</ram:CategoryCode>
        <ram:RateApplicablePercent>${t.rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join("");

  const storno = inv.type === "storno";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>${storno ? "384" : "380"}</ram:TypeCode>
    <ram:IssueDateTime>${date(inv.issueDate)}</ram:IssueDateTime>${notes.map(n => `
    <ram:IncludedNote><ram:Content>${esc(n)}</ram:Content></ram:IncludedNote>`).join("")}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(buyerReference || buyer.number)}</ram:BuyerReference>
      <ram:SellerTradeParty>${party(seller, seller.owner || seller.name, seller.phone, seller.email)}
        <ram:SpecifiedTaxRegistration>${taxRegistration(seller.taxId)}</ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>${party(buyer, buyer.type === "firma" ? buyer.contact : "", "", buyer.email)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>${inv.serviceDate ? `
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date(inv.serviceDate)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ""}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(inv.number)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(seller.iban.replace(/\s/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>${taxXml}${inv.serviceDateTo ? `
      <ram:BillingSpecifiedPeriod>
        <ram:StartDateTime>${date(inv.serviceDate)}</ram:StartDateTime>
        <ram:EndDateTime>${date(inv.serviceDateTo)}</ram:EndDateTime>
      </ram:BillingSpecifiedPeriod>` : ""}
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(storno ? "Stornorechnung – keine Zahlung fällig." : `Zahlbar bis ${new Date(inv.dueDate).toLocaleDateString("de-DE")} ohne Abzug.`)}</ram:Description>
        <ram:DueDateDateTime>${date(inv.dueDate)}</ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amt(lineTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amt(lineTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amt(taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amt(grand)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amt(grand)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${storno ? `
      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${esc(inv.refNumber)}</ram:IssuerAssignedID>
      </ram:InvoiceReferencedDocument>` : ""}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
