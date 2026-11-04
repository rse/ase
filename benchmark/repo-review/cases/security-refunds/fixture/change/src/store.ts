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

export async function ordersOf(customerId: string): Promise<Order[]> {
    return [...orders.values()].filter((o) => o.customer.id === customerId)
}
