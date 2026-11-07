export interface CartItem {
    sku: string
    name: string
    unitPrice: number
    quantity: number
}

/*  total of all items in euro  */
export function cartTotal(items: CartItem[]): number {
    let total = 0
    for (const item of items)
        total += item.unitPrice * item.quantity
    return total
}
