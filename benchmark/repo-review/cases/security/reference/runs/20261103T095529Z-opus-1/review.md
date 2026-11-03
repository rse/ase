🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Adds an order payment lifecycle (status, subtotal, paid/failed/cancelled transitions) driven by signed payment-provider webhooks, plus admin-initiated refunds on top of it.

| Severity     | Dimension     | Finding |
| ------------ | ------------- | ------- |
| **HIGH**     | SECURITY      | ▢ `src/webhook.ts:47-48`: Signature verification is skipped when `signature` is `undefined`. Anyone can omit the header and forge a `paid` event for any order. A missing signature must be rejected. |
| **HIGH**     | SECURITY      | ▢ `src/admin.ts:19-23`: `requireAdmin` lets through users whose `role` is `undefined` (anonymous callers). This contradicts its own comment and lets them issue refunds via `adminRefund`. The check should be `user.role !== "admin"`. |
| **HIGH**     | SECURITY      | ▢ `src/api.ts:33-38`: `handleGetOrder` never compares `query.customerId` with `order.customer.id`. Any signed-in customer can read another customer's order by guessing sequential `O<n>` ids (IDOR). |
| **HIGH**     | SECURITY      | ▢ `src/mail.ts:19-20`: The customer-typed discount `code` goes into the HTML mail without `escapeHtml`, although the comment calls it user input. Markup and links can be injected into shop mail. |
| **HIGH**     | CORRECTNESS   | ▢ `src/refund.ts:22-26`: `refundOrder` refunds `order.subtotal` (before discount). A discounted order is refunded more than the customer paid (`order.total`, which the webhook checks the payment against). |
| **HIGH**     | CORRECTNESS   | ▢ `src/admin.ts:30-41`: `adminRefund` never validates `req.amount`. It accepts negative values, amounts above `order.total`, and repeated refunds. The order stays `paid`, and `refundsOf` is never used to cap the total, so over-refunds have no limit. `refundOrder` can also be repeated. |
| **HIGH**     | CORRECTNESS   | ▢ `src/order.ts:100-108`: `markPaid` and `markFailed` do not check the current status. A replayed or out-of-order webhook can flip a `paid` order to `failed`, or mark a `cancelled` order (stock already released) as `paid`. `markFailed` never calls `releaseAll`, so stock reserved for failed payments stays reserved permanently. |
| **MEDIUM**   | SECURITY      | ▢ `src/webhook.ts:12`: `SECRET` silently falls back to `""` when `PAYMENT_WEBHOOK_SECRET` is unset, so anyone can compute valid signatures with an empty HMAC key. The module should fail fast when the secret is missing. |
| **MEDIUM**   | INTENT        | ▢ `src/api.ts:54-64`: Four changes are unrelated to payments and refunds: the random `recommendations` shuffle, `handleGetOrder`, the unused `ordersOf` (`src/store.ts:15`), and the `notify.ts` → `mail.ts` HTML-mail rewrite. This is scope creep, and the commit message mentions none of them. |
| **MEDIUM**   | TESTING       | ▢ `src/webhook.ts:45-60`: None of the new security-sensitive logic (signature check, admin authorization, refund amounts, status transitions) has a test, and the project has no test script. |
| **LOW**      | CLARITY       | ▢ `src/mail.ts:28-39`: The `catch` comment says "the outbox job retries later", but a mail that fails here never reaches the `outbox` and no retry job exists. |
| **LOW**      | DOCUMENTATION | ▢ `README.md:3-4`: The feature list omits payment webhooks, admin refunds, order status, and confirmation mails, and does not document the required `PAYMENT_WEBHOOK_SECRET` env var. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**