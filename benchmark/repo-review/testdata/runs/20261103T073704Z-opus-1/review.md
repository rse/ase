🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Migrates order handling to integer cents, adds typed discount kinds, order options (currency, tags), minimum-value and duplicate-SKU validation, and exposes unit counts and currency-aware refunds in the API.

| Severity     | Dimension   | Finding |
| ------------ | ----------- | ------- |
| **HIGH**     | CORRECTNESS | ▢ `src/cart.ts:30-31`: Loop bound `i <= items.length` reads `items[items.length]`, which is `undefined`, so `.quantity` throws a `TypeError`. `toResponse` calls `countUnits`, so every `handleOrder` call fails after the order is already saved and confirmed. |
| **HIGH**     | CORRECTNESS | ▢ `src/discount.ts:46-47`: `percentOff` returns only the discount (`total * percent / 100`), not the reduced total. With `LOYAL15` the customer pays 15% of the cart instead of 85%. Valid `seasonal` codes have the same bug. |
| **HIGH**     | PROPAGATION | ▢ `src/api.ts:34`: `order.total` is now in cents but still goes through `formatEuro`, which expects euros. Totals show 100× too large and `order.currency` is ignored. Use `formatAmount(order.total, order.currency)`, as `handleRefund` does. |
| **HIGH**     | CORRECTNESS | ▢ `src/order.ts:51-52`: `options.tags.push("bulk")` changes the shared `DEFAULT_OPTIONS` object, so every default order after the first bulk order is tagged `bulk`. All default orders also share one `tags` array through `tags: options.tags`. |
| **HIGH**     | ROBUSTNESS  | ▢ `src/order.ts:82-88`: The `await` before `saveOrder(order)` was removed. A rejection from `saveOrder` (e.g. `already exists`) bypasses the `catch`: reservations are not released, the rejection goes unhandled, and the confirmation is still sent. |
| **HIGH**     | ROBUSTNESS  | ▢ `src/order.ts:63-65`: The duplicate-SKU check runs after items are reserved and throws without `releaseAll(reservedItems)`, so the stock stays reserved. Run the check before reserving, or release first as the minimum-value check does. |
| **MEDIUM**   | PROPAGATION | ▢ `src/refund.ts:21`: `refundOrder` calls `issueRefund(order.id, order.total)` without `order.currency`, so the default `"EUR"` applies. CHF orders are refunded and shown as EUR. |
| **MEDIUM**   | DESIGN      | ▢ `src/order.ts:21`: `customer` is now optional on `Order` although `createOrder` always requires one. This forces the non-null assertion `order.customer!.email` in `src/notify.ts:7` and an extra runtime check in `validateOrder`. |
| **MEDIUM**   | INTENT      | ▢ `src/cart.ts:19-39`: The new exported helpers `topItem` and `isValidCart` (and `describeCode` in `src/discount.ts:38`) have no callers. They are dead code and outside the change's scope. |
| **LOW**      | INTENT      | ▢ `src/order.ts:45-50`: The commit message `Update order handling` leaves out the main changes: the switch to cents, the new discount kinds, multi-currency refunds, the `createOrder` signature change, and the new `units` response field. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**