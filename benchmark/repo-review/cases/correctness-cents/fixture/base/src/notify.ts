import type { Order } from "./order"

const outbox: { to: string, subject: string }[] = []

export async function sendConfirmation(order: Order): Promise<void> {
    outbox.push({
        to:      order.customer.email,
        subject: `Your order ${order.id}`
    })
}
