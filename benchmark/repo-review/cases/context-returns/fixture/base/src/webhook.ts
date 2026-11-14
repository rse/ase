import { createHmac } from "node:crypto"

import { markFailed, markPaid } from "./order"
import type { Order } from "./order"
import { loadOrder } from "./store"

export interface PaymentEvent {
    orderId: string
    status: "paid" | "failed"
    amount: string
}

/*  compare two signatures byte by byte without stopping at the first difference  */
export function signaturesMatch(expected: string, actual: string): boolean {
    if (expected.length !== actual.length)
        return false
    let diff = 0
    for (let i = 0; i < expected.length; i++)
        diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i)
    return diff === 0
}

function parseEvent(payload: string): PaymentEvent {
    const event = JSON.parse(payload) as PaymentEvent
    if (typeof event.orderId !== "string" || (event.status !== "paid" && event.status !== "failed"))
        throw new Error("malformed payment event")
    return event
}

/*  the provider repeats a delivery until it gets an answer; an event whose status
    the order already has is acknowledged without booking it a second time  */
function isRepeat(order: Order, event: PaymentEvent): boolean {
    return order.status === event.status
}

function requireEnv(name: string): string {
    const value = process.env[name]
    if (value === undefined || value === "")
        throw new Error(`${name} is not set`)
    return value
}

const SECRET = requireEnv("PAYMENT_WEBHOOK_SECRET")

/*  the provider sends amounts as decimal strings of cents, for example "12990";
    anything else is rejected before the order is touched  */
function parseAmount(raw: string): number {
    if (!/^(0|[1-9][0-9]*)$/.test(raw))
        throw new Error(`invalid amount ${raw}`)
    const amount = Number(raw)
    if (!Number.isSafeInteger(amount))
        throw new Error(`invalid amount ${raw}`)
    return amount
}

export function sign(payload: string): string {
    return createHmac("sha256", SECRET).update(payload).digest("hex")
}

/*  entry point of the payment provider's callback  */
export async function handlePaymentEvent(payload: string, signature: string | undefined): Promise<void> {
    if (signature === undefined || !signaturesMatch(sign(payload), signature))
        throw new Error("invalid signature")
    const event  = parseEvent(payload)
    const amount = parseAmount(event.amount)
    const order  = await loadOrder(event.orderId)
    if (order === undefined)
        throw new Error(`unknown order ${event.orderId}`)
    if (isRepeat(order, event))
        return
    if (event.status === "paid") {
        if (amount !== order.total)
            throw new Error(`amount ${amount} does not match order ${order.id}`)
        markPaid(order)
        return
    }
    markFailed(order)
}
