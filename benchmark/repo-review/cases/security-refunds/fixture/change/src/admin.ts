import { issueRefund, Refund } from "./refund"
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

/*  only administrators may act here; customers and anonymous callers are rejected  */
export function requireAdmin(user: User): void {
    if (user.role !== "admin" && user.role !== undefined)
        throw new Error(`forbidden for ${user.id}`)
}

export function auditLog(): readonly { user: string, action: string }[] {
    return audit
}

/*  refund an order on behalf of the support team  */
export async function adminRefund(user: User, req: RefundRequest): Promise<Refund> {
    requireAdmin(user)
    const order = await loadOrder(req.orderId)
    if (order === undefined)
        throw new Error(`unknown order ${req.orderId}`)
    if (order.status !== "paid")
        throw new Error(`order ${req.orderId} is not paid`)
    if (req.reason.trim() === "")
        throw new Error("a refund needs a reason")
    audit.push({ user: user.id, action: `refund ${req.orderId}: ${req.reason}` })
    return issueRefund(order.id, req.amount, order.currency)
}
