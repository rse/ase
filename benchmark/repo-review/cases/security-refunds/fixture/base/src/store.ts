import type { Order } from "./order"

const orders = new Map<string, Order>()

export async function saveOrder(order: Order): Promise<void> {
    if (orders.has(order.id))
        throw new Error(`order ${order.id} already exists`)
    orders.set(order.id, order)
}

export async function loadOrder(id: string): Promise<Order | undefined> {
    return orders.get(id)
}
