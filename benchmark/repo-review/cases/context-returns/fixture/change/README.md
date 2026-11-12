# shop-core

Order handling core of a small web shop: cart, discount codes,
inventory reservation, order creation, payment callbacks, refunds,
returns, store credit, reporting, and a thin API layer.

Build with `npm run build`.

## Orders

An order is `pending` until the payment provider confirms the payment
(`paid`) or declines it (`failed`). A pending order can be cancelled.
A paid order can be refunded in parts; it is `partially_refunded` while
part of its total is paid back and `refunded` once all of it is.

Amounts are whole cents in EUR. Orders below 10.00 EUR are rejected.
Dates are calendar days in UTC, written as `YYYY-MM-DD`.

## Store credit

Customers can hold store credit. An order can be paid with store credit
if the credit covers the whole order; such an order is paid at once and
needs no payment provider. Store credit is booked in a journal, one
entry per grant and per payment.

## Refunds

The support team can grant a goodwill refund of part of a paid order.
All refunds of an order together never exceed what was paid for it.

A refund is `pending` until the payment provider reports that the money
has left, and `settled` afterwards. Refunds as store credit are settled
at once. An order that was paid with store credit is always refunded as
store credit.

## Returns

Customers can send items back up to and including the 14th day after
delivery. The returns desk checks a parcel in; the units go back into
stock, and the customer is paid back the share of the order total that
belongs to them, to the payment method or as store credit. A customer
who sends back everything is paid back exactly what was paid.

A return is rejected if its refund would exceed what is left on the
order, for example after a goodwill refund.

## Reports

The daily report lists, per day, the number of orders placed and the
revenue they brought in.
