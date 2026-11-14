import { cartTotal, hasDuplicateSku, isValidCart } from "./cart"
import type { CartItem } from "./cart"
import { grantCredit, spendCredit } from "./credit"
import { applyDiscount } from "./discount"
import { reserve, release } from "./inventory"
import { sendConfirmation } from "./mail"
import type { Cents } from "./money"
import { saveOrder } from "./store"

export interface Customer {
    id: string
    email: string
}

export interface OrderOptions {
    tags: string[]
    discountCode?: string
    payWithCredit?: boolean
}

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled" | "partially_refunded" | "refunded"

export interface Order {
    id: string
    customer: Customer
    items: CartItem[]
    /*  amount before the discount code was applied, kept for the invoice  */
    subtotal: Cents
    total: Cents
    tags: string[]
    status: OrderStatus
    /*  day the order was placed and day the parcel was handed over  */
    placedOn: string
    deliveredOn?: string
    /*  set when store credit paid for the order  */
    paidWith?: "credit"
}

const MIN_ORDER_CENTS = 1000
const DEFAULT_OPTIONS: OrderOptions = { tags: [] }

let nextId = 1

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
    if (!isValidCart(items))
        throw new Error("invalid cart")
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
        tags,
        status:   "pending",
        placedOn: today
    }
    if (options.payWithCredit === true) {
        try {
            await spendCredit(customer.id, total, `order ${order.id}`)
        }
        catch (err) {
            releaseAll(reservedItems)
            throw err
        }
        order.paidWith = "credit"
        markPaid(order)
    }
    let stored: Order
    try {
        stored = await saveOrder(order)
    }
    catch (err) {
        releaseAll(reservedItems)
        if (order.paidWith === "credit")
            await grantCredit(customer.id, total, `order ${order.id} not stored`)
        throw err
    }
    await sendConfirmation(stored, options.discountCode)
    return stored
}

/*  whether money was collected for the order and can still be paid back  */
export function hasPayment(order: Order): boolean {
    return order.status === "paid" || order.status === "partially_refunded"
}

/*  the provider confirmed the payment; the reservation becomes a sale  */
export function markPaid(order: Order): void {
    if (order.status !== "pending")
        throw new Error(`order ${order.id} is not pending`)
    order.status = "paid"
}

/*  the provider declined the payment; the items go back on sale  */
export function markFailed(order: Order): void {
    if (order.status !== "pending")
        throw new Error(`order ${order.id} is not pending`)
    releaseAll(order.items)
    order.status = "failed"
}

/*  the customer cancelled before paying  */
export function cancelOrder(order: Order): void {
    if (order.status !== "pending")
        throw new Error(`order ${order.id} cannot be cancelled`)
    releaseAll(order.items)
    order.status = "cancelled"
}

/*  the carrier handed the parcel over  */
export function markDelivered(order: Order, day: string): void {
    if (!hasPayment(order))
        throw new Error(`order ${order.id} is not paid`)
    order.deliveredOn = day
}

/*  money was paid back; the order is refunded once nothing of its total is left  */
export function markRefund(order: Order, paidBack: Cents): void {
    if (!hasPayment(order))
        throw new Error(`order ${order.id} is not paid`)
    order.status = paidBack >= order.total ? "refunded" : "partially_refunded"
}

/*  the status in words, for the account page  */
export function statusText(order: Order): string {
    switch (order.status) {
        case "pending":
            return "waiting for payment"
        case "paid":
            return "paid"
        case "failed":
            return "payment failed"
        case "cancelled":
            return "cancelled"
        case "partially_refunded":
            return "partly refunded"
        case "refunded":
            return "refunded"
    }
}
