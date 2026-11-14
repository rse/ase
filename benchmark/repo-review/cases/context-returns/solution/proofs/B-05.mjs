/*  rule: the revenue of an order is what it brought in, less what was paid back  */
export default async function ({ load, assert }) {
    const { setStock }                   = await load("inventory")
    const { createOrder, markPaid }      = await load("order")
    const { requestRefund, settleRefund } = await load("refund")
    const { revenue }                    = await load("report")

    setStock("TEA", 10)
    const order = await createOrder({ id: "C1", email: "ada@example.org" },
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)
    assert.equal(revenue([ order ]), 5000, "a paid order of 50.00 is 50.00 of revenue")

    const refund = await requestRefund(order, 2000, "cash")
    settleRefund(order, refund)
    assert.equal(order.status, "partially_refunded", "20.00 of 50.00 were paid back")
    assert.equal(revenue([ order ]), 3000, "30.00 of revenue are left after 20.00 were paid back")
}
