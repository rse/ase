🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Switch order handling to integer cents with currency awareness. Add typed discount kinds (fixed/percent/seasonal), order options with tags, a minimum order value, duplicate-SKU validation, and a unit count in the order API response.

| Severity     | Dimension   | Finding |
| ------------ | ----------- | ------- |
| **HIGH**     | CORRECTNESS | ▢ `src/cart.ts:30-31`: Off-by-one bug. The loop condition `i <= items.length` reads `items[items.length]`, which is `undefined`, so `.quantity` throws `TypeError`. `toResponse` calls `countUnits`, so every `handleOrder` call now fails after the order has already been saved and confirmed. |
| **HIGH**     | CORRECTNESS | ▢ `src/discount.ts:33-34`: The `percent` and `seasonal` cases return `percentOff(total, found.value)`. That is the discount amount, not the reduced total, so `LOYAL15` charges 15% of the cart instead of 85%. |
| **HIGH**     | PROPAGATION | ▢ `src/api.ts:34`: `order.total` is now in cents, but `toResponse` still formats it with `formatEuro`, which expects euros. API totals come out 100x too high (25 EUR shows as `2500.00 EUR`). Use `formatAmount(order.total, order.currency)` instead. |
| **HIGH**     | CORRECTNESS | ▢ `src/order.ts:29,51-52`: `options.tags.push("bulk")` changes the shared module-level `DEFAULT_OPTIONS.tags` array. After one bulk order, every later order that uses the default options gets a `bulk` tag, and all those orders share the same array. |
| **HIGH**     | ROBUSTNESS  | ▢ `src/order.ts:82-88`: `saveOrder` is async but is no longer awaited. If it rejects, the `catch` never runs: reservations are not released, the rejection goes unhandled, and a confirmation is sent for an order that was never stored. |
| **HIGH**     | ROBUSTNESS  | ▢ `src/order.ts:63-65`: The duplicate-SKU check runs after the items are reserved and throws without calling `releaseAll(reservedItems)`. Each rejected order leaks its reserved stock for good. Run the check before reserving. |
| **MEDIUM**   | PROPAGATION | ▢ `src/refund.ts:21`: `refundOrder` does not pass `order.currency` to `issueRefund`, so the `"EUR"` default applies. Refunds for CHF orders are recorded and shown as EUR. |
| **MEDIUM**   | DESIGN      | ▢ `src/order.ts:21,33-35`: `Order.customer` is now optional, although `createOrder` always requires a `Customer`. This forces a dead check in `validateOrder` and a non-null assertion `order.customer!.email` in `src/notify.ts:7`, so type safety gets weaker for no benefit. |
| **MEDIUM**   | INTENT      | ▢ `src/cart.ts:18-40`: `topItem`, `isValidCart` and `describeCode` (`src/discount.ts:38`) are never called. They are unused speculative additions bundled into the order-handling change. |
| **MEDIUM**   | TESTING     | ▢ `package.json:6-8`: The repo has no tests and no test script, yet this commit changes the money unit, the discount math, and the reservation and rollback paths. One smoke test of `handleOrder` would have caught the `countUnits` crash and the percent-discount bug. |
| **LOW**      | INTENT      | ▢ `src/order.ts:45-50`: The commit message "Update order handling" leaves out the key changes: euros to cents, the breaking `createOrder` and `applyDiscount` signature changes, the new minimum order value, and the new `units` response field. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**