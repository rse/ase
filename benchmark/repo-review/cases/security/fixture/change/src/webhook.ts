import { createHmac } from "node:crypto"

import { markFailed, markPaid } from "./order"
import { loadOrder } from "./store"

export interface PaymentEvent {
    orderId: string
    status: "paid" | "failed"
    amount: string
}

const SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? ""

/*  compare two signatures byte by byte without stopping at the first difference  */
export function signaturesMatch(expected: string, actual: string): boolean {
    if (expected.length !== actual.length)
        return false
    let diff = 0
    for (let i = 0; i < expected.length; i++)
        diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i)
    return diff === 0
}

export function sign(payload: string): string {
    return createHmac("sha256", SECRET).update(payload).digest("hex")
}

/*  the provider sends amounts as decimal strings of cents, for example "12990";
    anything else is rejected before the order is touched  */
function parseAmount(raw: string): number {
    const amount = Number(raw)
    if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error(`invalid amount ${raw}`)
    return amount
}

function parseEvent(payload: string): PaymentEvent {
    const event = JSON.parse(payload) as PaymentEvent
    if (typeof event.orderId !== "string" || (event.status !== "paid" && event.status !== "failed"))
        throw new Error("malformed payment event")
    return event
}

/*  entry point of the payment provider's callback  */
export async function handlePaymentEvent(payload: string, signature: string | undefined): Promise<void> {
    if (signature !== undefined && !signaturesMatch(sign(payload), signature))
        throw new Error("invalid signature")
    const event  = parseEvent(payload)
    const amount = parseAmount(event.amount)
    const order  = await loadOrder(event.orderId)
    if (order === undefined)
        throw new Error(`unknown order ${event.orderId}`)
    if (event.status === "paid") {
        if (amount !== order.total)
            throw new Error(`amount ${amount} does not match order ${order.id}`)
        markPaid(order)
    }
    else
        markFailed(order)
}
