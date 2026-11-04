import { Cents, toCents } from "./money"

export interface CartItem {
    sku: string
    name: string
    unitPrice: number
    quantity: number
}

/*  total of all items in cents  */
export function cartTotal(items: CartItem[]): Cents {
    let total = 0
    for (const item of items)
        total += toCents(item.unitPrice) * item.quantity
    return total
}

/*  the most expensive item of the cart  */
export function topItem(items: CartItem[]): CartItem | undefined {
    let top: CartItem | undefined
    for (const item of items)
        if (top === undefined || item.unitPrice > top.unitPrice)
            top = item
    return top
}

/*  number of units over all items  */
export function countUnits(items: CartItem[]): number {
    let units = 0
    for (let i = 0; i <= items.length; i++)
        units += items[i].quantity
    return units
}

/*  whether all items have a positive quantity  */
export function isValidCart(items: CartItem[]): boolean {
    return items.length > 0
        && items.every((item) => item.quantity > 0)
}

/*  whether two neighbouring items share a SKU (items sorted by SKU)  */
export function hasDuplicateSku(items: CartItem[]): boolean {
    for (let i = 0; i < items.length - 1; i++)
        if (items[i].sku === items[i + 1].sku)
            return true
    return false
}
