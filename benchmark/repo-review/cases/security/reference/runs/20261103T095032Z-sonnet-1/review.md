🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Add an order status lifecycle, admin-initiated refunds, and a signed payment-provider webhook, and replace the notify module with a mail module that renders HTML confirmations.

| Severity   | Dimension   | Finding |
| ---------- | ----------- | ------- |
| **HIGH**   | SECURITY    | ▢ `src/admin.ts:21`: `requireAdmin` rejects only when the role is neither "admin" nor `undefined`, so callers with no role pass the admin check, contrary to its own comment. Anonymous callers can issue refunds through `adminRefund`. |
| **HIGH**   | SECURITY    | ▢ `src/webhook.ts:47`: `handlePaymentEvent` verifies the signature only when one is supplied, so a forged `paid` event without a signature marks any order paid. `SECRET` also defaults to "" when `PAYMENT_WEBHOOK_SECRET` is unset, which makes signatures forgeable. |
| **HIGH**   | SECURITY    | ▢ `src/mail.ts:18`: The customer-typed discount code is interpolated into the HTML mail without `escapeHtml`, unlike the other fields, which allows HTML injection into confirmation mails. |
| **HIGH**   | CORRECTNESS | ▢ `src/refund.ts:25`: `refundOrder` refunds `order.subtotal` (the pre-discount amount) instead of `order.total` (what was paid), so discounted orders are over-refunded. |
| **HIGH**   | SECURITY    | ▢ `src/api.ts:32`: `handleGetOrder` takes `query.customerId` but never checks it against `order.customer.id`, so any customer can read any order by guessing IDs such as `O1`. |
| **MEDIUM** | CORRECTNESS | ▢ `src/admin.ts:38`: `adminRefund` passes `req.amount` to `issueRefund` unchecked, so negative, NaN, or above-total amounts are accepted. It does not consult `refundsOf`, so an order can be refunded repeatedly, and the audit entry is written before the refund succeeds. |
| **MEDIUM** | CORRECTNESS | ▢ `src/order.ts:101`: `markPaid` and `markFailed` set the status unconditionally, while `cancelOrder` is guarded. A late or replayed webhook can turn a cancelled order into "paid" with its stock already released, or flip a paid order to "failed". |
| **MEDIUM** | INTENT      | ▢ `src/api.ts:54`: The random-shuffle `recommendations` helper, together with the unused `ordersOf`, `refundsOf`, and `cancelOrder`, serves neither refunds nor payment webhooks. This is scope creep that adds dead, non-deterministic API surface. |
| **MEDIUM** | TESTING     | ▢ `src/webhook.ts:1`: Security-sensitive logic (signature check, amount matching, admin gate, refund amounts, status transitions) has no tests. `README.md` still lists the old feature set and `package.json` is bumped to 1.6.0 with no changelog. |
| **LOW**    | DESIGN      | ▢ `src/webhook.ts:18`: `signaturesMatch` is a hand-rolled comparison instead of `crypto.timingSafeEqual`. `parseAmount` accepts "" as 0, and `parseEvent` does not validate the type of `amount`. |
| **LOW**    | DESIGN      | ▢ `src/api.ts:43`: Two diverging refund paths now exist: `handleRefund` has no authorization and trusts the caller-supplied `Order.status`, while `adminRefund` has its own checks and calls `issueRefund` directly. |
| **LOW**    | CLARITY     | ▢ `src/mail.ts:30`: The try/catch around the in-memory `outbox.push` can never fail, and its comment refers to an outbox retry job that does not exist, which misleads readers. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**