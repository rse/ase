/*  rule: the provider repeats a delivery until it gets an answer, so a repeated event is acknowledged  */
export default async function ({ load, assert }) {
    process.env.PAYMENT_WEBHOOK_SECRET = "secret of the test"
    const { setStock }                     = await load("inventory")
    const { createOrder, markPaid }        = await load("order")
    const { requestRefund, refundedTotal } = await load("refund")
    const { handlePaymentEvent, sign }     = await load("webhook")

    setStock("TEA", 10)
    const order = await createOrder({ id: "C1", email: "ada@example.org" },
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)
    const refund  = await requestRefund(order, 2000, "cash")
    const payload = JSON.stringify({ orderId: order.id, status: "refunded", amount: "2000", refundId: refund.id })

    /*  the provider reports that the 20.00 have left  */
    await handlePaymentEvent(payload, sign(payload))
    assert.equal(refund.status, "settled", "the first delivery settles the refund")
    assert.equal(order.status, "partially_refunded", "20.00 of 50.00 were paid back")

    /*  the answer got lost, the provider delivers the same event again  */
    let answer = "acknowledged"
    try {
        await handlePaymentEvent(payload, sign(payload))
    }
    catch (err) {
        answer = `error: ${err.message}`
    }
    assert.equal(answer, "acknowledged", "the repeated delivery of a partial refund is acknowledged")
    assert.equal(refundedTotal(order.id), 2000, "the 20.00 are booked once")
}
