🟠 **REVIEW VERDICT**: **REJECT - DEMANDS CHANGES**

🔵 **CHANGE INTENT**: Refactor order handling to integer-cent money, an options-based `createOrder` with multi-kind discount codes, currency support, a minimum order value and duplicate-SKU checks, and expose `units` in the API response.

| Severity   | Dimension   | Finding |
| ---------- | ----------- | ------- |
| **HIGH**   | CORRECTNESS | ▢ `src/cart.ts:30`: `countUnits` loops with `i <= items.length`, so it reads `items[items.length]` and throws a `TypeError`. Every `handleOrder` call that reaches `toResponse` fails, and it happens after the order is saved and the confirmation sent. |
| **HIGH**   | CORRECTNESS | ▢ `src/api.ts:34`: `order.total` is now in cents (`cartTotal`/`applyDiscount` return `Cents`), but `toResponse` still passes it to `formatEuro`, which treats it as euros. A 12.00 order is reported as `1200.00 EUR`. `formatAmount(order.total, order.currency)` would also keep the order's currency, which `formatEuro` ignores. |
| **HIGH**   | CORRECTNESS | ▢ `src/order.ts:83`: `saveOrder` is async but is no longer awaited. The `try/catch` cannot see its rejection, so a duplicate-id failure becomes an unhandled rejection, `releaseAll` never runs, and stock leaks while the confirmation is still sent. |
| **HIGH**   | CORRECTNESS | ▢ `src/order.ts:63-65`: The duplicate-SKU check throws after stock has been reserved and without calling `releaseAll(reservedItems)`, unlike the minimum-value path, so reservations leak. The check also belongs before the reservation loop. |
| **HIGH**   | CORRECTNESS | ▢ `src/order.ts:51-52`: `options.tags.push("bulk")` mutates the caller's array and, for the default argument, the shared module-level `DEFAULT_OPTIONS.tags`. The `"bulk"` tag accumulates across orders, and every default-options order shares one `tags` array. |
| **MEDIUM** | PROPAGATION | ▢ `src/refund.ts:21`: `refundOrder` calls `issueRefund(order.id, order.total)` without `order.currency`, so refunds of CHF orders default to `"EUR"` and are formatted in the wrong currency by `handleRefund`. |
| **MEDIUM** | DESIGN      | ▢ `src/notify.ts:7`: Making `Order.customer` optional forces a non-null assertion `order.customer!.email` here. `createOrder` always sets the customer, so `validateOrder` right after construction is dead. Keep `customer` required and drop the optional/`!`/validate round trip. |
| **MEDIUM** | DESIGN      | ▢ `src/order.ts:29`: A mutable shared default object holds a mutable array, which is the root of the tag-leak bug. Create fresh options per call, or make `tags` readonly and copy it. |
| **MEDIUM** | TESTING     | ▢ `src/order.ts:45-91`: The change adds substantial new behaviour (discount kinds with expiry, minimum order, duplicate SKUs, currency, unit counts) with no tests, and the repo has no test setup. Several of the bugs above would be caught by a trivial test. |
| **LOW**    | INTENT      | ▢ `src/cart.ts:18-45`: `topItem`, `isValidCart`, `describeCode` and the exported `validateOrder` have no callers in the change. They are speculative additions, and `isValidCart` is not applied to `createOrder`, so non-positive quantities still pass through. |
| **LOW**    | CLARITY     | ▢ `src/api.ts:19-21`: The `req.code == null` branching duplicates the `createOrder` call and builds an options literal inline. `{ ...DEFAULTS, discountCode: req.code ?? undefined }` would be simpler. |

⧉ **ASE**: ▷ hint [normal]: **Use `/ase-task-edit` to derive a solution approach and plan for the findings which demand changes.**

⧉ **ASE**: ✪ skill: **ase-repo-review**, ▶ status: **skill finished**