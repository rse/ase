import { grantCredit } from "./credit"
import type { Cents } from "./money"
import { hasPayment, markRefund } from "./order"
import type { Order } from "./order"

export type RefundMethod = "cash" | "credit"
export type RefundStatus = "pending" | "settled"

export interface Refund {
    id: string
    orderId: string
    amount: Cents
    method: RefundMethod
    status: RefundStatus
}

export interface RefundSummary {
    paidBack: Cents
    onItsWay: Cents
    left: Cents
}

const refunds: Refund[] = []

let nextId = 1

export function refundsOf(orderId: string): Refund[] {
    return refunds.filter((r) => r.orderId === orderId)
}

export function findRefund(id: string): Refund | undefined {
    return refunds.find((r) => r.id === id)
}

/*  what has actually been paid back on an order  */
export function refundedTotal(orderId: string): Cents {
    let sum = 0
    for (const refund of refundsOf(orderId))
        if (refund.status === "settled")
            sum += refund.amount
    return sum
}

/*  what is promised on an order: paid back or still on its way  */
export function committedTotal(orderId: string): Cents {
    let sum = 0
    for (const refund of refundsOf(orderId))
        sum += refund.amount
    return sum
}

/*  what can still be refunded on an order  */
export function refundable(order: Order): Cents {
    return order.total - committedTotal(order.id)
}

/*  the figures of an order for the account page  */
export function refundSummary(order: Order): RefundSummary {
    const paidBack = refundedTotal(order.id)
    return {
        paidBack,
        onItsWay: committedTotal(order.id) - paidBack,
        left:     refundable(order)
    }
}

/*  refunds the payment provider has not reported yet, oldest first  */
export function pendingRefunds(): Refund[] {
    return refunds.filter((r) => r.status === "pending")
}

/*  the money of a refund has left: mark it and bring the order up to date  */
export function settleRefund(order: Order, refund: Refund): void {
    if (refund.orderId !== order.id)
        throw new Error(`refund ${refund.id} does not belong to order ${order.id}`)
    if (refund.status === "settled")
        throw new Error(`refund ${refund.id} is already settled`)
    markRefund(order, refundedTotal(order.id) + refund.amount)
    refund.status = "settled"
}

/*  book a refund; an order paid with store credit gets store credit back at once,
    everything else waits for the payment provider  */
export async function issueRefund(order: Order, amount: Cents, method: RefundMethod = "cash"): Promise<Refund> {
    const refund: Refund = {
        id:      `R${nextId++}`,
        orderId: order.id,
        amount,
        method:  order.paidWith === "credit" ? "credit" : method,
        status:  "pending"
    }
    refunds.push(refund)
    if (refund.method === "credit") {
        try {
            await grantCredit(order.customer.id, amount, `refund ${refund.id}`)
        }
        catch (err) {
            refunds.splice(refunds.indexOf(refund), 1)
            throw err
        }
        settleRefund(order, refund)
    }
    return refund
}

/*  refund asked for by a customer or the returns desk  */
export async function requestRefund(order: Order, amount: Cents, method: RefundMethod): Promise<Refund> {
    if (!hasPayment(order))
        throw new Error(`order ${order.id} has no payment to refund`)
    if (method !== "cash" && method !== "credit")
        throw new Error("a refund goes to the payment method or to store credit")
    if (!Number.isSafeInteger(amount) || amount <= 0)
        throw new Error("a refund needs a positive amount")
    if (amount > refundable(order))
        throw new Error(`refund exceeds what is left on order ${order.id}`)
    return issueRefund(order, amount, method)
}

/*  full refund of a paid order: whatever has not been promised yet  */
export async function refundOrder(order: Order): Promise<Refund> {
    if (!hasPayment(order))
        throw new Error("only paid orders can be refunded")
    const rest = refundable(order)
    if (rest <= 0)
        throw new Error(`nothing is left to refund on order ${order.id}`)
    return requestRefund(order, rest, "cash")
}
