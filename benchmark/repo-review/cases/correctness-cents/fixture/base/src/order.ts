import { CartItem, cartTotal } from "./cart"
import { applyDiscount } from "./discount"
import { reserve, release } from "./inventory"
import { sendConfirmation } from "./notify"
import { saveOrder } from "./store"

export interface Customer {
    id: string
    email: string
}

export interface Order {
    id: string
    customer: Customer
    items: CartItem[]
    total: number
}

let nextId = 1

export async function createOrder(customer: Customer, items: CartItem[], code?: string): Promise<Order> {
    const reservedItems: CartItem[] = []
    for (const item of items) {
        if (!reserve(item.sku, item.quantity)) {
            for (const r of reservedItems)
                release(r.sku, r.quantity)
            throw new Error(`not enough stock for ${item.sku}`)
        }
        reservedItems.push(item)
    }
    const total = applyDiscount(cartTotal(items), code)
    const order: Order = { id: `O${nextId++}`, customer, items, total }
    try {
        await saveOrder(order)
    }
    catch (err) {
        for (const r of reservedItems)
            release(r.sku, r.quantity)
        throw err
    }
    await sendConfirmation(order)
    return order
}
