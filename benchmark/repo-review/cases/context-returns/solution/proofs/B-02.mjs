/*  rule: the customer gets a confirmation of a return by mail  */
export default async function ({ load, assert }) {
    const { setStock }                             = await load("inventory")
    const { createOrder, markPaid, markDelivered } = await load("order")
    const { receiveReturn }                        = await load("returns")
    const { queuedMails }                          = await load("mail")

    setStock("TEA", 10)
    const order = await createOrder({ id: "C1", email: "ada@example.org" },
        [ { sku: "TEA", name: "Tea", unitPrice: 12.5, quantity: 4 } ], { tags: [] }, "2026-03-02")
    markPaid(order)
    markDelivered(order, "2026-03-04")
    await receiveReturn(order, [ { sku: "TEA", quantity: 1 } ], "cash", "2026-03-10")

    const mails = queuedMails().filter((mail) => mail.subject.includes("return"))
    assert.deepEqual(mails.map((mail) => mail.to), [ "ada@example.org" ],
        "one confirmation of the return is queued for the customer's address")
}
