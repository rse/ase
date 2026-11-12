import { formatAmount } from "./money"
import type { Order } from "./order"
import type { Refund } from "./refund"
import type { ReturnLine } from "./returns"

export interface Mail {
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
        lines.push(`<p>Your code ${escapeHtml(code)} was applied.</p>`)
    return lines.join("\n")
}

/*  what came back and what is paid back for it  */
function renderReturnConfirmation(order: Order, lines: ReturnLine[], refund: Refund): string {
    const rows = lines.map((line) => `<li>${line.quantity} x ${line.sku}</li>`)
    const target = refund.method === "credit" ? "as store credit" : "to your payment method"
    return [
        `<h1>We received your return</h1>`,
        `<p>Order ${escapeHtml(order.id)}:</p>`,
        `<ul>${rows.join("")}</ul>`,
        `<p>${formatAmount(refund.amount)} will be paid back ${target}.</p>`
    ].join("\n")
}

export function outboxSize(): number {
    return outbox.length
}

/*  the mails waiting to be sent, oldest first  */
export function queuedMails(): readonly Mail[] {
    return outbox
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

export async function sendReturnConfirmation(order: Order, lines: ReturnLine[], refund: Refund): Promise<void> {
    try {
        queueMail({
            to:      order.id,
            subject: `Your return for order ${order.id}`,
            html:    renderReturnConfirmation(order, lines, refund)
        })
    }
    catch (err) {
        console.error(`mail for the return of ${order.id} not queued`, err)
    }
}
