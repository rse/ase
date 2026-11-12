/*  rule: all refunds of an order together never exceed what was paid for it  */
export default async function ({ load, assert }) {
    const { setStock }              = await load("inventory")
    const { createOrder, markPaid } = await load("order")
    const { adminRefund }           = await load("admin")
    const { committedTotal }        = await load("refund")

    setStock("TEA", 10)
    const order = await createOrder({ id: "C1", email: "ada@example.org" },
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)
    const support = { id: "U1", role: "admin" }

    /*  two goodwill refunds of 30.00 on an order of 50.00, before the provider reported the first  */
    await adminRefund(support, { orderId: order.id, amount: 3000, reason: "parcel arrived late" })
    let second = "accepted"
    try {
        await adminRefund(support, { orderId: order.id, amount: 3000, reason: "parcel arrived late" })
    }
    catch (err) {
        second = "rejected"
    }
    assert.equal(second, "rejected", "a second goodwill refund of 30.00 does not fit into an order of 50.00")
    assert.ok(committedTotal(order.id) <= order.total, "the refunds stay within the 50.00 that were paid")
}
