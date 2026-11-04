export interface DiscountCode {
    code: string
    amount: number
}

const CODES: DiscountCode[] = [
    { code: "WELCOME5", amount: 5 }
]

export function findCode(code: string): DiscountCode | undefined {
    return CODES.find((c) => c.code === code)
}

export function applyDiscount(total: number, code?: string): number {
    const found = code ? findCode(code) : undefined
    if (found === undefined)
        return total
    return Math.max(0, total - found.amount)
}
