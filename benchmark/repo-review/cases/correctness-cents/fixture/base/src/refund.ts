import type { Order } from "./order"

export interface Refund {
    orderId: string
    amount: number
}

const refunds: Refund[] = []

export function issueRefund(orderId: string, amount: number): Refund {
    const refund = { orderId, amount }
    refunds.push(refund)
    return refund
}

export function refundOrder(order: Order): Refund {
    if (order.total <= 0)
        throw new Error("nothing to refund")
    return issueRefund(order.id, order.total)
}
