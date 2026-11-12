/*  rule: store credit cannot be spent twice; payments never exceed what was granted  */
export default async function ({ load, assert }) {
    const { grantCredit, spendCredit, creditBalance } = await load("credit")

    await grantCredit("C1", 100, "gift")
    const results = await Promise.allSettled([
        spendCredit("C1", 60, "first order"),
        spendCredit("C1", 60, "second order")
    ])
    const paid = results.filter((r) => r.status === "fulfilled").length
    assert.equal(paid, 1, "only one of two simultaneous payments of 60 fits into a credit of 100")
    assert.equal(creditBalance("C1"), 40, "40 of the 100 are left")
}
