export type Cents = number
export type Currency = "EUR" | "CHF"

export function toCents(euro: number): Cents {
    return Math.round(euro * 100)
}

export function formatAmount(amount: Cents, currency: Currency): string {
    return `${(amount / 100).toFixed(2)} ${currency}`
}
