import { CartItem, cartTotal, hasDuplicateSku } from "./cart"
import { applyDiscount } from "./discount"
import { reserve, release } from "./inventory"
import { sendConfirmation } from "./mail"
import { Currency } from "./money"
import { saveOrder } from "./store"

export interface Customer {
    id: string
    email: string
}

export interface OrderOptions {
    tags: string[]
    currency: Currency
    discountCode?: string
}

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled"

export interface Order {
    id: string
    customer: Customer
    items: CartItem[]
    /*  amount before the discount code was applied, kept for the invoice  */
    subtotal: number
    total: number
    currency: Currency
    tags: string[]
    status: OrderStatus
}

const MIN_ORDER_CENTS = 1000
const DEFAULT_OPTIONS: OrderOptions = { tags: [], currency: "EUR" }

let nextId = 1

export function validateOrder(order: Order): void {
    if (order.items.length === 0)
        throw new Error("order without items")
}

function releaseAll(items: CartItem[]): void {
    for (const item of items)
        release(item.sku, item.quantity)
}

export async function createOrder(
    customer: Customer,
    items: CartItem[],
    options: OrderOptions = DEFAULT_OPTIONS,
    today: string = new Date().toISOString().slice(0, 10)
): Promise<Order> {
    const tags = [...options.tags]
    if (items.some((item) => item.quantity >= 10))
        tags.push("bulk")

    const sorted = [...items].sort((a, b) => a.sku.localeCompare(b.sku))
    if (hasDuplicateSku(sorted))
        throw new Error("duplicate SKU in order")

    const reservedItems: CartItem[] = []
    for (const item of items) {
        if (!reserve(item.sku, item.quantity)) {
            releaseAll(reservedItems)
            throw new Error(`not enough stock for ${item.sku}`)
        }
        reservedItems.push(item)
    }

    const subtotal = cartTotal(items)
    const total    = applyDiscount(subtotal, options.discountCode, today)
    if (total < MIN_ORDER_CENTS) {
        releaseAll(reservedItems)
        throw new Error("order below minimum value")
    }

    const order: Order = {
        id:       `O${nextId++}`,
        customer,
        items,
        subtotal,
        total,
        currency: options.currency,
        tags,
        status:   "pending"
    }
    validateOrder(order)
    try {
        await saveOrder(order)
    }
    catch (err) {
        releaseAll(reservedItems)
        throw err
    }
    await sendConfirmation(order, options.discountCode)
    return order
}

/*  the provider confirmed the payment; the reservation becomes a sale  */
export function markPaid(order: Order): void {
    if (order.status !== "pending")
        throw new Error(`order ${order.id} is not pending`)
    order.status = "paid"
}

/*  the provider declined the payment  */
export function markFailed(order: Order): void {
    if (order.status !== "pending")
        throw new Error(`order ${order.id} is not pending`)
    order.status = "failed"
}

/*  the customer cancelled before paying  */
export function cancelOrder(order: Order): void {
    if (order.status !== "pending")
        throw new Error(`order ${order.id} cannot be cancelled`)
    releaseAll(order.items)
    order.status = "cancelled"
}
