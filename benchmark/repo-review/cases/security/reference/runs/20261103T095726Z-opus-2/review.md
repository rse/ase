🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Adds an order payment lifecycle (status, subtotal, paid/failed/cancelled transitions) driven by a signed payment-provider webhook. It also adds an admin-only refund path with auditing, a customer order-detail endpoint and an HTML confirmation mail.

| Severity     | Dimension     | Finding |
| ------------ | ------------- | ------- |
| **HIGH**     | SECURITY      | ▢ `src/admin.ts:20-22`: `requireAdmin` only rejects when `user.role !== "admin" && user.role !== undefined`. Any caller without a `role` therefore passes and can call `adminRefund`, even though the function's own comment says anonymous callers must be rejected. |
| **HIGH**     | SECURITY      | ▢ `src/webhook.ts:46-47`: Signature verification is skipped when `signature` is `undefined`. Anyone can POST an unsigned `{"status":"paid"}` event and mark any order paid without paying. |
| **HIGH**     | SECURITY      | ▢ `src/api.ts:33-37`: `handleGetOrder` never compares `query.customerId` with `order.customer.id`. Any signed-in customer can read another customer's order by guessing the sequential `O<n>` id (IDOR). |
| **HIGH**     | SECURITY      | ▢ `src/mail.ts:19-20`: The discount `code` the customer types goes into the confirmation HTML without `escapeHtml`, unlike every other field. This allows HTML/link injection into mails the shop sends, and the code is inserted even when it is not a valid code. |
| **HIGH**     | CORRECTNESS   | ▢ `src/refund.ts:22-26`: The full refund pays out `order.subtotal` (before discount) instead of `order.total` (what the customer actually paid). Every discounted order is over-refunded. |
| **HIGH**     | CORRECTNESS   | ▢ `src/admin.ts:30-40`: `adminRefund` does not validate `req.amount`, so it can be negative, zero or more than `order.total`, and earlier refunds are ignored. The order stays `paid` afterwards (there is no `refunded` status and `refundsOf` is never used), so the same order can be refunded repeatedly. |
| **HIGH**     | CORRECTNESS   | ▢ `src/webhook.ts:54-59`: Events are applied without checking the current status, and `markPaid`/`markFailed` (`src/order.ts:101-108`) have no guards either. A replayed or late `failed` event downgrades a paid order, and a `paid` event revives a cancelled or failed order whose stock was already released. |
| **MEDIUM**   | SECURITY      | ▢ `src/webhook.ts:12`: `SECRET` silently falls back to `""` when `PAYMENT_WEBHOOK_SECRET` is unset, so anyone can forge the HMACs. A missing secret should fail at startup. |
| **MEDIUM**   | CORRECTNESS   | ▢ `src/order.ts:100-108`: `markFailed` does not release the inventory reservation (unlike `cancelOrder`), so every declined payment keeps its stock reserved permanently. `markPaid` also does not turn the reservation into a sale, although its comment says it does. |
| **MEDIUM**   | INTENT        | ▢ `src/api.ts:54-64`: The randomized `recommendations` shuffle is an unrelated start-page feature included in the payment/refund change. It should be a separate change. |
| **LOW**      | COVERAGE      | ▢ `src/webhook.ts:28-35`: `parseAmount` uses `Number(raw)`, which accepts `""`, `" "`, `"1e3"` and `"0x10"`. That breaks its documented "decimal strings of cents only" contract, and `parseEvent` never type-checks `event.amount`. |
| **LOW**      | PROPAGATION   | ▢ `src/store.ts:15-17`: The new `ordersOf` (like `refundsOf` in `src/refund.ts:18`) is not called anywhere in the change, so it is dead code. |
| **LOW**      | INTENT        | ▢ `src/mail.ts:1-40`: The commit message leaves out several changes: the `notify.ts` → `mail.ts` rename with HTML mail, the `handleGetOrder` endpoint, the `subtotal`-based refund and `recommendations`. |
| **LOW**      | DOCUMENTATION | ▢ `README.md:3-4`: The README feature list does not mention the webhook, the order status lifecycle, admin refunds or confirmation mails, even though the version was bumped to `1.6.0`. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**