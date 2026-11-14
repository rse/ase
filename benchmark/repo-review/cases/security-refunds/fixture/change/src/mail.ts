import type { Order } from "./order"

interface Mail {
    to: string
    subject: string
    html: string
}

const outbox: Mail[] = []

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

function queueMail(mail: Mail): void {
    if (!/^[^@\s]+@[^@\s]+$/.test(mail.to))
        throw new Error(`invalid recipient ${mail.to}`)
    outbox.push(mail)
}

export async function sendConfirmation(order: Order, code?: string): Promise<void> {
    try {
        queueMail({
            to:      order.customer.email,
            subject: `Your order ${order.id}`,
            html:    renderConfirmation(order, code)
        })
    }
    catch (err) {
        /*  the order is already stored; a bad address must not turn it into a failed order  */
        console.error(`mail for ${order.id} not queued`, err)
    }
}
