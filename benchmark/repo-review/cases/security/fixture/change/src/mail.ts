import type { Order } from "./order"

const outbox: { to: string, subject: string, html: string }[] = []

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

/*  confirmation mail; the discount code is the one the customer typed into the order form  */
export function renderConfirmation(order: Order, code: string | undefined): string {
    const lines = [
        `<h1>Thank you for your order</h1>`,
        `<p>Order ${escapeHtml(order.id)} for ${escapeHtml(order.customer.email)} is confirmed.</p>`
    ]
    if (code !== undefined)
        lines.push(`<p>Your code ${code} was applied.</p>`)
    return lines.join("\n")
}

export function outboxSize(): number {
    return outbox.length
}

export async function sendConfirmation(order: Order, code?: string): Promise<void> {
    try {
        outbox.push({
            to:      order.customer.email,
            subject: `Your order ${order.id}`,
            html:    renderConfirmation(order, code)
        })
    }
    catch (err) {
        /*  a mail problem must never fail an order that is already stored; the outbox job retries later  */
        console.error(`mail for ${order.id} not queued`, err)
    }
}
