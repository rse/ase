/*  rule: items can come back up to and including the 14th day after delivery  */
export default async function ({ load, assert }) {
    const { addDays, returnWindowOpen } = await load("returns")

    const delivered = (deliveredOn) => ({ deliveredOn })
    assert.equal(returnWindowOpen(delivered("2026-01-20"), "2026-01-20"), true,  "open on the day of delivery")
    assert.equal(returnWindowOpen(delivered("2026-01-20"), "2026-02-03"), true,  "open on the 14th day")
    assert.equal(returnWindowOpen(delivered("2026-01-20"), "2026-02-04"), false, "closed on the 15th day")

    /*  across the end of February with and without a leap day, and across the end of a year  */
    assert.equal(addDays("2028-02-20", 14), "2028-03-05", "2028 has a 29th of February")
    assert.equal(addDays("2026-02-20", 14), "2026-03-06", "2026 has none")
    assert.equal(returnWindowOpen(delivered("2026-12-25"), "2027-01-08"), true,  "open on the 14th day in the new year")
    assert.equal(returnWindowOpen(delivered("2026-12-25"), "2027-01-09"), false, "closed on the 15th day in the new year")
    assert.equal(returnWindowOpen(delivered("2026-09-28"), "2026-10-12"), true,  "open on the 14th day in the next month")
    assert.equal(returnWindowOpen(delivered("2026-09-28"), "2026-10-13"), false, "closed on the 15th day in the next month")

    assert.equal(returnWindowOpen({}, "2026-02-03"), false, "nothing can come back before the delivery")
}
