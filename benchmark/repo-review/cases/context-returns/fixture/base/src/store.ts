import type { Order } from "./order"

const orders = new Map<string, Order>()

/*  the store keeps its own record, so later changes to the caller's object stay out of it  */
function toRecord(order: Order): Order {
    return {
        id:          order.id,
        customer:    { ...order.customer },
        items:       order.items.map((item) => ({ ...item })),
        subtotal:    order.subtotal,
        total:       order.total,
        tags:        [...order.tags],
        status:      order.status,
        placedOn:    order.placedOn,
        deliveredOn: order.deliveredOn
    }
}

/*  store a new order and hand back the stored record  */
export async function saveOrder(order: Order): Promise<Order> {
    if (orders.has(order.id))
        throw new Error(`order ${order.id} already exists`)
    const record = toRecord(order)
    orders.set(order.id, record)
    return record
}

export async function loadOrder(id: string): Promise<Order | undefined> {
    return orders.get(id)
}

export async function ordersOf(customerId: string): Promise<Order[]> {
    return [...orders.values()].filter((o) => o.customer.id === customerId)
}

export async function allOrders(): Promise<Order[]> {
    return [...orders.values()]
}
