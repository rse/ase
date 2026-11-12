/*  rule: the account page shows the whole percent of the order total that was paid back  */
export default async function ({ load, assert }) {
    const { setStock }                    = await load("inventory")
    const { createOrder, markPaid }       = await load("order")
    const { requestRefund, settleRefund } = await load("refund")
    const { handleRefundStatus }          = await load("api")

    setStock("TEA", 10)
    const customer = { id: "C1", email: "ada@example.org" }
    const order = await createOrder(customer,
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)
    const query = { customerId: "C1", orderId: order.id }
    assert.equal((await handleRefundStatus(query)).share, 0, "nothing was paid back yet")

    settleRefund(order, await requestRefund(order, 2000, "cash"))
    assert.equal((await handleRefundStatus(query)).share, 40, "20.00 of 50.00 are 40 percent")

    settleRefund(order, await requestRefund(order, 3000, "cash"))
    assert.equal((await handleRefundStatus(query)).share, 100, "all of it was paid back")

    /*  every stored order has a total of at least 10.00, so the share is always a number  */
    await assert.rejects(createOrder(customer,
        [ { sku: "TEA", name: "Tea", unitPrice: 2.5, quantity: 2 } ], { tags: [] }, "2026-03-02"),
        /below minimum value/, "an order of 5.00 is not accepted")
    await assert.rejects(createOrder(customer,
        [ { sku: "TEA", name: "Tea", unitPrice: 0, quantity: 2 } ], { tags: [] }, "2026-03-02"),
        /invalid cart/, "an item without a price is not accepted")
}
