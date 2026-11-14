/*  rule: an order paid with store credit is paid at once and needs no payment provider  */
export default async function ({ load, assert }) {
    const { setStock, available }        = await load("inventory")
    const { grantCredit, creditBalance } = await load("credit")
    const { createOrder }                = await load("order")
    const { loadOrder, ordersOf }        = await load("store")

    setStock("TEA", 10)
    const customer = { id: "C1", email: "ada@example.org" }
    const items    = [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ]

    /*  the credit must cover the whole order of 50.00  */
    await grantCredit("C1", 4999, "gift")
    await assert.rejects(createOrder(customer, items, { tags: [], payWithCredit: true }, "2026-03-02"),
        /not enough store credit/, "49.99 of credit do not pay for an order of 50.00")
    assert.equal(creditBalance("C1"), 4999, "the credit is untouched")
    assert.equal(available("TEA"), 10, "the items are on sale again")
    assert.deepEqual(await ordersOf("C1"), [], "no order was stored")

    await grantCredit("C1", 2001, "gift")
    const placed = await createOrder(customer, items, { tags: [], payWithCredit: true }, "2026-03-02")
    const order  = await loadOrder(placed.id)
    assert.equal(order.status, "paid", "the order is paid without an event of the payment provider")
    assert.equal(creditBalance("C1"), 2000, "50.00 of the 70.00 of credit paid for it")
    assert.equal(available("TEA"), 6, "the four units are sold")
}
