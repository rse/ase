import { toCents } from "./money"
import type { Cents } from "./money"

export interface CartItem {
    sku: string
    name: string
    unitPrice: number
    quantity: number
}

/*  article numbers are upper-case letters and digits in groups joined by hyphens  */
const SKU_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/

/*  total of all items in cents  */
export function cartTotal(items: CartItem[]): Cents {
    let total = 0
    for (const item of items)
        total += toCents(item.unitPrice) * item.quantity
    return total
}

/*  number of units over all items  */
export function countUnits(items: CartItem[]): number {
    let units = 0
    for (let i = 0; i < items.length; i++)
        units += items[i].quantity
    return units
}

/*  whether the cart has items and every item has a well-formed article number,
    a positive price, and a positive whole quantity  */
export function isValidCart(items: CartItem[]): boolean {
    return items.length > 0
        && items.every((item) => SKU_PATTERN.test(item.sku)
            && item.unitPrice > 0
            && Number.isSafeInteger(item.quantity) && item.quantity > 0)
}

/*  whether two neighbouring items share a SKU (items sorted by SKU)  */
export function hasDuplicateSku(items: CartItem[]): boolean {
    for (let i = 0; i < items.length - 1; i++)
        if (items[i].sku === items[i + 1].sku)
            return true
    return false
}
