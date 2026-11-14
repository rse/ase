/*  rule: a customer who sends back everything is paid back exactly what was paid  */
export default async function ({ load, assert }) {
    const { setStock }                             = await load("inventory")
    const { createOrder, markPaid, markDelivered } = await load("order")
    const { receiveReturn }                        = await load("returns")

    const skus = [ "TEA", "MUG", "CUP" ]
    for (const sku of skus)
        setStock(sku, 5)
    const order = await createOrder({ id: "C1", email: "ada@example.org" },
        skus.map((sku) => ({ sku, name: sku, unitPrice: 4.35, quantity: 1 })),
        { tags: [], discountCode: "LOYAL15" }, "2026-03-02")
    /*  3 x 4.35 = 13.05, less 15 percent (1.96) = 11.09  */
    assert.equal(order.total, 1109, "the order costs 11.09 after the discount")
    markPaid(order)
    markDelivered(order, "2026-03-04")

    /*  the three items come back in three parcels  */
    let paidBack = 0
    const rejected = []
    for (const sku of skus) {
        try {
            paidBack += (await receiveReturn(order, [ { sku, quantity: 1 } ], "cash", "2026-03-10")).amount
        }
        catch (err) {
            rejected.push(`${sku}: ${err.message}`)
        }
    }
    assert.deepEqual(rejected, [], "each of the three returns is accepted")
    assert.equal(paidBack, 1109, "the three refunds add up to the 11.09 that was paid")
}
