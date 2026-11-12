const stock    = new Map<string, number>()
const reserved = new Map<string, number>()

export function setStock(sku: string, quantity: number): void {
    stock.set(sku, quantity)
}

export function available(sku: string): number {
    return (stock.get(sku) ?? 0) - (reserved.get(sku) ?? 0)
}

export function reserve(sku: string, quantity: number): boolean {
    if (available(sku) < quantity)
        return false
    reserved.set(sku, (reserved.get(sku) ?? 0) + quantity)
    return true
}

export function release(sku: string, quantity: number): void {
    const current = reserved.get(sku) ?? 0
    reserved.set(sku, Math.max(0, current - quantity))
}

/*  units that came back from a customer are on the shelf again  */
export function restock(sku: string, quantity: number): void {
    stock.set(sku, (stock.get(sku) ?? 0) + quantity)
}
