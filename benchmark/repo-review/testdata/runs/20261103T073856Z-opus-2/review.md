🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Switch order totals and discounts to integer cents with typed discount kinds and currencies, and extend order creation with options, tags, validation, minimum-value and duplicate-SKU checks, plus a `units` count in the API response.

| Severity     | Dimension   | Finding |
| ------------ | ----------- | ------- |
| **HIGH**     | CORRECTNESS | ▢ `src/discount.ts:46-48`: `percentOff` returns the discount amount (`total * percent / 100`) instead of the reduced total. With `LOYAL15` or an active `SPRING10`, the customer pays only 15% or 10% of the cart instead of 85% or 90%. |
| **HIGH**     | CORRECTNESS | ▢ `src/cart.ts:30-31`: Off-by-one: `i <= items.length` reads `items[items.length].quantity` and throws a `TypeError`. Every `handleOrder` call goes through `toResponse`, so it fails after the order is already saved and the confirmation sent. |
| **HIGH**     | PROPAGATION | ▢ `src/api.ts:34`: `order.total` is now in cents, but it is still passed to `formatEuro`, which expects euros. A 15 EUR order is shown as `1500.00 EUR`. Use `formatAmount(order.total, order.currency)`, as `handleRefund` already does. |
| **HIGH**     | CORRECTNESS | ▢ `src/order.ts:82-88`: The `await` on the async `saveOrder(order)` call was dropped, so the `try`/`catch` never sees a rejection. Reservations are not released, the confirmation is still sent, and the rejection goes unhandled. |
| **HIGH**     | CORRECTNESS | ▢ `src/order.ts:29,51-52`: `options.tags.push("bulk")` changes the shared `DEFAULT_OPTIONS.tags` array (or the options the caller passed in). After one bulk order, every later order with default options gets the `bulk` tag, and the array keeps growing. |
| **HIGH**     | ROBUSTNESS  | ▢ `src/order.ts:54-65`: The duplicate-SKU check runs after all items are reserved and throws without calling `releaseAll(reservedItems)`, so the stock stays reserved permanently. Check before reserving, or release on failure like the other error paths. |
| **MEDIUM**   | PROPAGATION | ▢ `src/refund.ts:21`: `refundOrder` does not pass `order.currency` to `issueRefund`, so the `"EUR"` default applies and a CHF order is refunded and reported as EUR. |
| **MEDIUM**   | DESIGN      | ▢ `src/order.ts:21`: `customer` became optional even though `createOrder` always requires one. This weakens the type and forces the non-null assertion `order.customer!` in `src/notify.ts:7`, plus a check in `validateOrder` that can never fail. |
| **MEDIUM**   | INTENT      | ▢ `src/cart.ts:18-39`: The new exports `topItem`, `isValidCart` (and `describeCode` in `src/discount.ts:38`) are not used anywhere. They are speculative scope creep that adds untested code. |
| **MEDIUM**   | TESTING     | ▢ `src/discount.ts:22-36`: None of the new money logic has tests (cents conversion, percent/seasonal discounts, minimum order value, duplicate-SKU rejection), and the repo has no tests at all. That is how the inverted percent discount and the `countUnits` crash got through. |
| **LOW**      | INTENT      | ▢ `src/order.ts:1-91`: The commit message `Update order handling` leaves out the main changes: euros to cents, new discount kinds and codes, currency support, the minimum order value, and the new `units` response field (an API change). |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**