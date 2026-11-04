import { Currency } from "./money"
import type { Order } from "./order"

export interface Refund {
    orderId: string
    amount: number
    currency: Currency
}

const refunds: Refund[] = []

export function issueRefund(orderId: string, amount: number, currency: Currency = "EUR"): Refund {
    const refund = { orderId, amount, currency }
    refunds.push(refund)
    return refund
}

export function refundsOf(orderId: string): Refund[] {
    return refunds.filter((r) => r.orderId === orderId)
}

/*  full refund of a paid order  */
export function refundOrder(order: Order): Refund {
    if (order.status !== "paid")
        throw new Error("only paid orders can be refunded")
    return issueRefund(order.id, order.subtotal, order.currency)
}
