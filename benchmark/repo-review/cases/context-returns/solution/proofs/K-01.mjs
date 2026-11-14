/*  rule: refunds asked for at the same time still stay within what is left on the order  */
export default async function ({ load, assert }) {
    const { setStock }                      = await load("inventory")
    const { createOrder, markPaid }         = await load("order")
    const { requestRefund, committedTotal } = await load("refund")
    const { creditBalance }                 = await load("credit")

    setStock("TEA", 10)
    const order = await createOrder({ id: "C1", email: "ada@example.org" },
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)

    /*  two refunds of 30.00 as store credit on an order of 50.00, asked for at the same moment  */
    const results = await Promise.allSettled([
        requestRefund(order, 3000, "credit"),
        requestRefund(order, 3000, "credit")
    ])
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "only one of the two refunds is accepted")
    assert.equal(committedTotal(order.id), 3000, "30.00 are promised")
    assert.equal(creditBalance("C1"), 3000, "30.00 of store credit were granted")

    /*  and one after the other: 20.00 still fit, another 0.01 does not  */
    await requestRefund(order, 2000, "cash")
    await assert.rejects(requestRefund(order, 1, "cash"), "nothing is left on the order")
}
