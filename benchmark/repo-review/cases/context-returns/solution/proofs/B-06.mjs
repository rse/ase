/*  rule: an order that was paid with store credit is refunded as store credit  */
export default async function ({ load, assert }) {
    const { setStock }                   = await load("inventory")
    const { grantCredit, creditBalance } = await load("credit")
    const { createOrder }                = await load("order")
    const { loadOrder }                  = await load("store")
    const { refundOrder }                = await load("refund")

    setStock("TEA", 10)
    await grantCredit("C1", 5000, "gift")
    const placed = await createOrder({ id: "C1", email: "ada@example.org" },
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [], payWithCredit: true }, "2026-03-02")
    assert.equal(creditBalance("C1"), 0, "the credit of 50.00 paid for the order of 50.00")

    const order = await loadOrder(placed.id)
    assert.equal(order.paidWith, "credit", "the stored order still knows that store credit paid for it")
    const refund = await refundOrder(order)
    assert.equal(refund.method, "credit", "its refund goes back as store credit")
    assert.equal(creditBalance("C1"), 5000, "the customer has the 50.00 of credit again")
}
