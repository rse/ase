🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Adds partial refunds with pending/settled states, store credit as a payment and refund method, and customer returns (with restocking, proportional refunds and a confirmation mail), plus the API, webhook, README and version changes that go with them.

| Severity     | Dimension   | Finding |
| ------------ | ----------- | ------- |
| **HIGH**     | PROPAGATION | ▢ `src/store.ts:6-17`: `toRecord` was not extended with the new `paidWith` field, so a credit-paid order loses it when saved. `issueRefund` then reads `order.paidWith` from the stored record, so refunds go out as cash instead of store credit, contradicting the README rule "always refunded as store credit". |
| **HIGH**     | CORRECTNESS | ▢ `src/returns.ts:91-93`: The loop in `restockLines` starts at `i = 1`, so the first returned line is never put back into stock. A single-line return restocks nothing. |
| **HIGH**     | CORRECTNESS | ▢ `src/mail.ts:76-80`: `sendReturnConfirmation` sets `to: order.id` instead of `order.customer.email`. `queueMail` rejects it as an invalid recipient, so the error is swallowed and logged and no return mail is ever queued. The sku is also interpolated into the HTML unescaped in `renderReturnConfirmation`, unlike the other fields. |
| **HIGH**     | CORRECTNESS | ▢ `src/credit.ts:48-55`: `spendCredit` writes `balance - amount` from a balance read before `await book(...)`. Two concurrent spends both pass the check and the later write overwrites the earlier one, so the customer can spend the same credit twice. |
| **HIGH**     | CORRECTNESS | ▢ `src/returns.ts:57-64`: `returnAmount` rounds each line's share separately. A full return can therefore sum to a cent more or less than `order.total`, so it is either rejected by `requestRefund` as exceeding what is left or underpays. This contradicts the README promise that a customer who sends back everything gets exactly what was paid. |
| **HIGH**     | CORRECTNESS | ▢ `src/admin.ts:42-43`: `adminRefund` checks the limit against `order.total - refundedTotal(...)`, which counts only settled refunds. Pending refunds are ignored, so goodwill refunds can exceed what is left (e.g. a pending return refund plus a goodwill refund). It should use `refundable(order)` or call `requestRefund`, which already holds the same validation. |
| **MEDIUM**   | PROPAGATION | ▢ `src/report.ts:12-16`: `revenue` counts only orders with status `paid`. The new `partially_refunded` status drops an order out of the revenue and daily report entirely, although part of its total is still earned. |
| **MEDIUM**   | ROBUSTNESS  | ▢ `src/webhook.ts:83-91`: `isRepeat` compares `order.status` with `event.status`, which never matches for a repeated `refunded` event on a `partially_refunded` order. `settleRefund` then throws "already settled", so the provider's retries keep failing instead of being acknowledged. |
| **MEDIUM**   | ROBUSTNESS  | ▢ `src/order.ts:105-109`: If `saveOrder` fails after credit was spent, the compensating `await grantCredit(...)` can itself throw. That masks the original error and leaves the credit lost, and the spend, order and refund steps are not atomic. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**