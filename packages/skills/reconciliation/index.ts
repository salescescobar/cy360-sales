/**
 * Skill: reconciliation (Agent B). Spec #1 v5 section 4 — the known discrepancy between
 * revenuerecognition/list (recognized, service-date basis) and salessummarydetailed
 * (payment-basis) is never hidden: this computes, per FeeCategory and TransactionType, both
 * totals side by side plus the delta, so an admin/CEO can see exactly where the two diverge
 * and decide the recognition rule in config.yaml (report.recognition) — never a number this
 * module silently picks on its own.
 */
import type { RecognizedRevenueRow } from "../courtreserve-ingest/index";
import type { SalesTransactionRow } from "../courtreserve-ingest/index";

export type ReconciliationRow = {
  feeCategory: string;
  transactionType: string; // "unknown" when the source row had none
  recognizedCents: number;
  recognizedTaxCents: number;
  paymentBasisCents: number;
  paymentBasisTaxCents: number;
  deltaCents: number; // recognized - paymentBasis
};

function transactionTypeOf(raw: Record<string, unknown>): string {
  const t = raw.TransactionType;
  return typeof t === "string" && t.length > 0 ? t : "unknown";
}

export function computeReconciliation(
  recognized: RecognizedRevenueRow[],
  paymentBasis: SalesTransactionRow[],
): ReconciliationRow[] {
  const byKey = new Map<string, ReconciliationRow>();
  const keyOf = (feeCategory: string, transactionType: string) => `${feeCategory}::${transactionType}`;

  const get = (feeCategory: string, transactionType: string): ReconciliationRow => {
    const key = keyOf(feeCategory, transactionType);
    let row = byKey.get(key);
    if (!row) {
      row = { feeCategory, transactionType, recognizedCents: 0, recognizedTaxCents: 0, paymentBasisCents: 0, paymentBasisTaxCents: 0, deltaCents: 0 };
      byKey.set(key, row);
    }
    return row;
  };

  for (const r of recognized) {
    const row = get(r.groupName, r.transactionType ?? "unknown");
    row.recognizedCents += r.amountCents;
    row.recognizedTaxCents += r.taxCents;
  }
  for (const p of paymentBasis) {
    const row = get(p.category, transactionTypeOf(p.raw));
    row.paymentBasisCents += p.grossCents;
    row.paymentBasisTaxCents += p.taxCents;
  }
  for (const row of byKey.values()) row.deltaCents = row.recognizedCents - row.paymentBasisCents;

  return [...byKey.values()].sort((a, b) => a.feeCategory.localeCompare(b.feeCategory) || a.transactionType.localeCompare(b.transactionType));
}

export type ReconciliationSummary = {
  rows: ReconciliationRow[];
  totalRecognizedCents: number;
  totalPaymentBasisCents: number;
  totalDeltaCents: number;
};

export function summarizeReconciliation(rows: ReconciliationRow[]): ReconciliationSummary {
  return {
    rows,
    totalRecognizedCents: rows.reduce((a, r) => a + r.recognizedCents, 0),
    totalPaymentBasisCents: rows.reduce((a, r) => a + r.paymentBasisCents, 0),
    totalDeltaCents: rows.reduce((a, r) => a + r.deltaCents, 0),
  };
}
