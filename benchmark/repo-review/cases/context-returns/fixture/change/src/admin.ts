import { hasPayment } from "./order"
import { issueRefund, refundedTotal } from "./refund"
import type { Refund } from "./refund"
import { loadOrder } from "./store"

export type Role = "admin" | "customer"

export interface User {
    id: string
    role?: Role
}

export interface RefundRequest {
    orderId: string
    amount: number
    reason: string
}

const audit: { user: string, action: string }[] = []

export function requireAdmin(user: User): void {
    if (user.role !== "admin")
        throw new Error(`forbidden for ${user.id}`)
}

export function auditLog(): readonly { user: string, action: string }[] {
    return audit
}

/*  goodwill refund of part of an order on behalf of the support team  */
export async function adminRefund(user: User, req: RefundRequest): Promise<Refund> {
    requireAdmin(user)
    const order = await loadOrder(req.orderId)
    if (order === undefined)
        throw new Error(`unknown order ${req.orderId}`)
    if (!hasPayment(order))
        throw new Error(`order ${req.orderId} is not paid`)
    if (req.reason.trim() === "")
        throw new Error("a refund needs a reason")
    if (!Number.isSafeInteger(req.amount) || req.amount <= 0)
        throw new Error("a refund needs a positive amount")
    if (req.amount > order.total - refundedTotal(order.id))
        throw new Error(`refund exceeds what is left on order ${order.id}`)
    audit.push({
        user:   user.id,
        action: `refund ${req.orderId}: ${req.reason}`
    })
    return issueRefund(order, req.amount)
}
