🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Adds partial refunds settled via payment-provider callbacks, 14-day customer returns that restock units and refund a proportional amount, and store credit that can pay for orders and receive refunds, plus matching API endpoints, a new mail and README updates.

| Severity     | Dimension   | Finding |
| ------------ | ----------- | ------- |
| **HIGH**     | PROPAGATION | ▢ `src/store.ts:6-18`: `toRecord` does not copy the new `paidWith` field, so orders paid with credit lose `paidWith: "credit"` when stored or loaded. `issueRefund` then falls back to a `cash` refund through a payment provider that never took the money. This breaks the README rule that such orders are always refunded as store credit. |
| **HIGH**     | CORRECTNESS | ▢ `src/returns.ts:92-95`: `restockLines` starts at `i = 1`, so the units of the first return line never go back into stock. A single-line return restocks nothing. |
| **HIGH**     | CORRECTNESS | ▢ `src/mail.ts:77`: `sendReturnConfirmation` sends to `order.id` instead of `order.customer.email`. `queueMail` always throws `invalid recipient`, the error is caught and only logged, and no return confirmation is ever queued. |
| **HIGH**     | PROPAGATION | ▢ `src/admin.ts:42`: `adminRefund` still checks the limit against `refundedTotal`, which now counts only settled refunds. Goodwill refunds can stack on top of pending refunds and exceed what was paid. Use `refundable(order)` or go through `requestRefund`. |
| **HIGH**     | ROBUSTNESS  | ▢ `src/credit.ts:47-55`: `spendCredit` reads `balance` before `await book(...)` and writes `balance - amount` afterwards. Two concurrent spends can both pass the check and overdraw the credit. A `grantCredit` that runs in between gets overwritten (lost update). |
| **HIGH**     | CORRECTNESS | ▢ `src/returns.ts:72`: Each line is rounded on its own via `Math.round(... * order.total / order.subtotal)`, so on discounted orders the line refunds can add up to a cent more or less than `order.total`. The last return is then rejected, or a cent stays unrefunded and the order never reaches `refunded`. This contradicts the README promise that a full return pays back exactly what was paid. |
| **MEDIUM**   | ROBUSTNESS  | ▢ `src/webhook.ts:38-40`: `isRepeat` compares the order status with the event status, so it misses a redelivered `refunded` event while the order is `partially_refunded`. `settleRefund` then throws `already settled` and the provider gets no acknowledgement and keeps redelivering, although the comment promises repeats are acknowledged. |
| **MEDIUM**   | PROPAGATION | ▢ `src/report.ts:14`: `revenue` counts only `status === "paid"`. After even a one-cent goodwill refund or return, the new `partially_refunded` status drops the whole order total from the daily report, not just the refunded part. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**