🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Refactor order handling to use integer cents, an options object, typed discount codes, and multi-currency refunds, while adding unrelated validation and helpers.

| Severity   | Dimension   | Finding |
| ---------- | ----------- | ------- |
| **HIGH**   | CORRECTNESS | `▢ src/cart.ts:30`: `countUnits` loops with `i <= items.length`, so `items[items.length]` is `undefined` and `.quantity` throws a TypeError on every call. `handleOrder` calls it via `toResponse`, so every order request crashes. |
| **HIGH**   | CORRECTNESS | `▢ src/discount.ts:47`: `percentOff` returns the discount amount (`total * percent / 100`) instead of the total minus that amount. `LOYAL15` on a 10000-cent cart yields a 1500 total instead of 8500. |
| **HIGH**   | CORRECTNESS | `▢ src/order.ts:51`: `options.tags.push("bulk")` mutates the caller's options object, including the shared `DEFAULT_OPTIONS`. A single bulk order makes "bulk" stick to every later default-options order, and repeated bulk orders add duplicate tags. |
| **HIGH**   | ROBUSTNESS  | `▢ src/order.ts:82`: `saveOrder` is async but called without `await`, so the try/catch cannot catch its rejection. On a duplicate id, stock is not released and a confirmation is still sent for an unsaved order. |
| **HIGH**   | ROBUSTNESS  | `▢ src/order.ts:63`: The duplicate-SKU check runs after stock is reserved and throws without calling `releaseAll`, so the reservation leaks. `validateOrder` at line 81 has the same leak. |
| **HIGH**   | PROPAGATION | `▢ src/api.ts:34`: `formatEuro(order.total)` formats a total that is now in cents, so a 12.50 EUR order is reported as "1250.00 EUR". It also ignores `order.currency`, and `handleRefund` already uses `formatAmount`, which makes the two responses inconsistent. |
| **MEDIUM** | PROPAGATION | `▢ src/refund.ts:21`: `refundOrder` calls `issueRefund(order.id, order.total)` without `order.currency`, so a CHF order is refunded and formatted as EUR. |
| **MEDIUM** | DESIGN      | `▢ src/notify.ts:7`: `order.customer!.email` uses a non-null assertion because `Order.customer` was made optional, although `createOrder` always sets it. This hides a possible crash and weakens type safety. |
| **MEDIUM** | INTENT      | `▢ src/order.ts:28`: The unrelated `MIN_ORDER_CENTS` rule is a new business behaviour that rejects orders under 10 EUR, including ones reduced by `WELCOME5`. Unused exports (`topItem`, `isValidCart`, `describeCode`, `validateOrder`) also ride along with no caller. |
| **LOW**    | TESTING     | `▢ src/cart.ts:18`: Plausible: `topItem`, `isValidCart` and `hasDuplicateSku` have no tests, and `hasDuplicateSku` silently depends on pre-sorted input. The repository has no tests for any of this logic. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**