import type { Cents } from "./money"
import { hasPayment, markRefunded } from "./order"
import type { Order } from "./order"

export interface Refund {
    orderId: string
    amount: Cents
}

const refunds: Refund[] = []

export function issueRefund(orderId: string, amount: Cents): Refund {
    const refund = { orderId, amount }
    refunds.push(refund)
    return refund
}

export function refundsOf(orderId: string): Refund[] {
    return refunds.filter((r) => r.orderId === orderId)
}

/*  what has been refunded on an order so far  */
export function refundedTotal(orderId: string): Cents {
    let sum = 0
    for (const refund of refundsOf(orderId))
        sum += refund.amount
    return sum
}

/*  full refund of a paid order: whatever has not been refunded yet  */
export function refundOrder(order: Order): Refund {
    if (!hasPayment(order))
        throw new Error("only paid orders can be refunded")
    const rest = order.total - refundedTotal(order.id)
    if (rest <= 0)
        throw new Error(`nothing is left to refund on order ${order.id}`)
    const refund = issueRefund(order.id, rest)
    markRefunded(order)
    return refund
}
