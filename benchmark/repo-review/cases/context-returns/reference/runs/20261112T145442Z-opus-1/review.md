🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Adds partial refunds that are settled by the payment provider, store credit as both a payment and a refund method, and a 14-day returns process that restocks returned units and refunds each line's share of the order total.

| Severity   | Dimension   | Finding |
| ---------- | ----------- | ------- |
| **HIGH**   | CORRECTNESS | ▢ `src/returns.ts:91-94`: `restockLines` starts its loop at `i = 1`. The first line of every return is never restocked, so a one-line return restocks nothing even though the customer is refunded. |
| **HIGH**   | CORRECTNESS | ▢ `src/mail.ts:76-79`: `sendReturnConfirmation` sends the mail to `order.id` instead of `order.customer.email`. `queueMail` rejects that recipient and the error is only logged, so no return confirmation is ever sent. |
| **HIGH**   | PROPAGATION | ▢ `src/admin.ts:42-48`: `adminRefund` still caps the refund with `refundedTotal`, which now counts only settled refunds, and then calls the unchecked `issueRefund`. Pending refunds are ignored, so a goodwill refund can push the total refunded above what was paid, which the README forbids. It should go through `requestRefund` / `refundable`. |
| **HIGH**   | ROBUSTNESS  | ▢ `src/credit.ts:47-54`: `spendCredit` reads `balance` before `await book(...)` and writes `balance - amount` after it. Two concurrent spends can both pass the check (double spend), and a credit grant made during the await is overwritten (lost update). |
| **MEDIUM** | CORRECTNESS | ▢ `src/returns.ts:68-74`: Each line's share is rounded separately with `Math.round`, so the shares may not add up to `order.total`. Example: subtotal 1500, total 1250, three items at 500 → 3 × 417 = 1251. The customer is then refunded too little, or the last return is rejected, which breaks the README promise that returning everything refunds exactly what was paid. |
| **MEDIUM** | CORRECTNESS | ▢ `src/webhook.ts:38-40`: `isRepeat` only checks `order.status === event.status`. Once an order is `partially_refunded`, a redelivered `refunded` event makes `settleRefund` throw "already settled", and a redelivered `paid` event makes `markPaid` throw. The provider then keeps retrying because the event is never acknowledged. |
| **MEDIUM** | PROPAGATION | ▢ `src/report.ts:14`: `revenue` counts only orders with `status === "paid"`. An order that becomes `partially_refunded` drops out of daily revenue entirely, even though most of its total was kept. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**