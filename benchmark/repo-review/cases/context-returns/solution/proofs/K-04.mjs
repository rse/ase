/*  rule: only article numbers of the order reach the confirmation of a return, and those are plain  */
export default async function ({ load, assert }) {
    const { setStock }                             = await load("inventory")
    const { createOrder, markPaid, markDelivered } = await load("order")
    const { receiveReturn }                        = await load("returns")

    setStock("TEA-01", 10)
    const customer = { id: "C1", email: "ada@example.org" }

    /*  an order cannot carry an article number with markup in it  */
    for (const sku of [ "<b>TEA</b>", "TEA\"", "tea 01", "TEA&01", "" ])
        await assert.rejects(createOrder(customer,
            [ { sku, name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02"),
            /invalid cart/, `the article number ${JSON.stringify(sku)} is not accepted`)

    const order = await createOrder(customer,
        [ { sku: "TEA-01", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)
    markDelivered(order, "2026-03-04")

    /*  a return cannot name anything but an article number of its order  */
    for (const sku of [ "<img src=x>", "TEA-01<script>", "tea-01", "MUG" ])
        await assert.rejects(receiveReturn(order, [ { sku, quantity: 1 } ], "cash", "2026-03-10"),
            /has no item/, `a return of ${JSON.stringify(sku)} is not accepted`)

    const refund = await receiveReturn(order, [ { sku: "TEA-01", quantity: 1 } ], "cash", "2026-03-10")
    assert.equal(refund.amount, 1250, "the return of one unit of the order is accepted")
}
