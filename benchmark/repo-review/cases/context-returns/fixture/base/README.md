# shop-core

Order handling core of a small web shop: cart, discount codes,
inventory reservation, order creation, payment callbacks, refunds,
reporting, and a thin API layer.

Build with `npm run build`.

## Orders

An order is `pending` until the payment provider confirms the payment
(`paid`) or declines it (`failed`). A pending order can be cancelled.
A paid order can be refunded in full; it is `refunded` afterwards.

Amounts are whole cents in EUR. Orders below 10.00 EUR are rejected.
Dates are calendar days in UTC, written as `YYYY-MM-DD`.

## Refunds

The support team can grant a goodwill refund of part of a paid order.
All refunds of an order together never exceed what was paid for it.

## Reports

The daily report lists, per day, the number of orders placed and the
revenue they brought in.
