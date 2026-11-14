/*  rule: the units of a return go back into stock, every line of it  */
export default async function ({ load, assert }) {
    const { setStock, available }                  = await load("inventory")
    const { createOrder, markPaid, markDelivered } = await load("order")
    const { receiveReturn }                        = await load("returns")

    setStock("TEA", 10)
    const order = await createOrder({ id: "C1", email: "ada@example.org" },
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)
    markDelivered(order, "2026-03-04")
    assert.equal(available("TEA"), 6, "four of ten units are sold")

    await receiveReturn(order, [ { sku: "TEA", quantity: 3 } ], "cash", "2026-03-10")
    assert.equal(available("TEA"), 9, "the three returned units are on sale again")
}
