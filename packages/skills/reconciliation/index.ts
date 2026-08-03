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

/** One subtotal per FeeCategory — the detail view groups by this instead of listing every
 *  (FeeCategory, TransactionType) pair flat (spec item 2: "a flat 12-row matrix is the
 *  failure being fixed"); `rows` carries the transaction-type breakdown, collapsed by
 *  default in the UI. */
export type CategoryGroup = {
  feeCategory: string;
  recognizedCents: number;
  recognizedTaxCents: number;
  paymentBasisCents: number;
  paymentBasisTaxCents: number;
  deltaCents: number;
  rows: ReconciliationRow[];
};

export function groupByFeeCategory(rows: ReconciliationRow[]): CategoryGroup[] {
  const byCategory = new Map<string, CategoryGroup>();
  for (const row of rows) {
    let group = byCategory.get(row.feeCategory);
    if (!group) {
      group = { feeCategory: row.feeCategory, recognizedCents: 0, recognizedTaxCents: 0, paymentBasisCents: 0, paymentBasisTaxCents: 0, deltaCents: 0, rows: [] };
      byCategory.set(row.feeCategory, group);
    }
    group.recognizedCents += row.recognizedCents;
    group.recognizedTaxCents += row.recognizedTaxCents;
    group.paymentBasisCents += row.paymentBasisCents;
    group.paymentBasisTaxCents += row.paymentBasisTaxCents;
    group.deltaCents += row.deltaCents;
    group.rows.push(row);
  }
  return [...byCategory.values()].sort((a, b) => a.feeCategory.localeCompare(b.feeCategory));
}

/**
 * Plain-English explanations for why recognized and payment-basis diverge, computed from the
 * rows themselves — never a hardcoded narrative (spec item 2). One driver per FeeCategory, the
 * highest-magnitude explanation wins when more than one applies, ranked by impact and capped at
 * 5 so the manager sees the biggest reasons first, not every reason.
 */
export type ReconciliationDriver = {
  kind: "only_payment_basis" | "only_recognized" | "multi_transaction_type" | "timing";
  feeCategory: string;
  amountCents: number; // the amount named in the sentence; magnitude also drives ranking
  transactionTypes?: string[]; // only_transaction_type
};

export function computeDrivers(rows: ReconciliationRow[]): ReconciliationDriver[] {
  const byCategory = new Map<string, ReconciliationDriver>();
  const consider = (d: ReconciliationDriver) => {
    const existing = byCategory.get(d.feeCategory);
    if (!existing || Math.abs(d.amountCents) > Math.abs(existing.amountCents)) byCategory.set(d.feeCategory, d);
  };

  for (const g of groupByFeeCategory(rows)) {
    if (g.recognizedCents === 0 && g.paymentBasisCents !== 0) {
      consider({ kind: "only_payment_basis", feeCategory: g.feeCategory, amountCents: g.paymentBasisCents });
    } else if (g.paymentBasisCents === 0 && g.recognizedCents !== 0) {
      consider({ kind: "only_recognized", feeCategory: g.feeCategory, amountCents: g.recognizedCents });
    }

    const transactionTypes = [...new Set(g.rows.map(r => r.transactionType))].sort();
    if (transactionTypes.length > 1) {
      consider({ kind: "multi_transaction_type", feeCategory: g.feeCategory, amountCents: g.deltaCents, transactionTypes });
    }

    // Fallback only — a real delta with no structural explanation above is a timing gap
    // (service in one month, paid in another), never left silently unexplained.
    if (g.deltaCents !== 0 && !byCategory.has(g.feeCategory)) {
      consider({ kind: "timing", feeCategory: g.feeCategory, amountCents: g.deltaCents });
    }
  }

  return [...byCategory.values()].sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents)).slice(0, 5);
}

export type ReconciliationSummary = {
  rows: ReconciliationRow[];
  groups: CategoryGroup[];
  drivers: ReconciliationDriver[];
  totalRecognizedCents: number;
  totalPaymentBasisCents: number;
  totalDeltaCents: number;
};

export function summarizeReconciliation(rows: ReconciliationRow[]): ReconciliationSummary {
  return {
    rows,
    groups: groupByFeeCategory(rows),
    drivers: computeDrivers(rows),
    totalRecognizedCents: rows.reduce((a, r) => a + r.recognizedCents, 0),
    totalPaymentBasisCents: rows.reduce((a, r) => a + r.paymentBasisCents, 0),
    totalDeltaCents: rows.reduce((a, r) => a + r.deltaCents, 0),
  };
}
