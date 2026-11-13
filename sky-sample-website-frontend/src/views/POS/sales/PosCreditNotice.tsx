import React from "react";
import { Alert, Typography } from "@mui/material";
import type { Customer } from "../../../api/customersApi";
import { creditPosition } from "./posCustomerInsights";
import { formatSaleRs } from "./saleFormUtils";

interface Props {
  customer: Customer | null;
  /** How much of this sale goes on the customer's account. */
  creditAmount: number;
}

/**
 * The customer's account, shown whenever any part of a sale goes on credit,
 * so the cashier sees the limit before the debt is added rather than after.
 *
 * Going over the limit is shown in red but not blocked. The system stores a
 * credit limit but has never enforced one, and refusing a regular's sale at
 * the counter is a call for the owner, not the till.
 */
const PosCreditNotice: React.FC<Props> = ({ customer, creditAmount }) => {
  if (!(creditAmount > 0)) return null;

  if (!customer) {
    return (
      <Alert severity="warning" sx={{ mb: 1.5, py: 0.25 }}>
        Select a customer to sell on credit.
      </Alert>
    );
  }

  const pos = creditPosition(customer, creditAmount);
  if (!pos) return null;

  return (
    <Alert severity={pos.overLimitBy > 0 ? "error" : "info"} sx={{ mb: 1.5, py: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        On credit: {formatSaleRs(creditAmount)}
      </Typography>
      <Typography variant="caption" sx={{ display: "block" }}>
        Owes now {formatSaleRs(pos.owesNow)} · after this sale {formatSaleRs(pos.owesAfter)}
      </Typography>
      <Typography variant="caption" sx={{ display: "block" }}>
        {pos.limit === null
          ? "No credit limit set"
          : `Limit ${formatSaleRs(pos.limit)} · available ${formatSaleRs(pos.available ?? 0)}`}
      </Typography>
      {pos.overLimitBy > 0 ? (
        <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
          This goes {formatSaleRs(pos.overLimitBy)} over their limit.
        </Typography>
      ) : null}
    </Alert>
  );
};

export default PosCreditNotice;
