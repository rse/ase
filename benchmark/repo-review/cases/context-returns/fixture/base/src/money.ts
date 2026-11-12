export type Cents = number

export function toCents(euro: number): Cents {
    return Math.round(euro * 100)
}

export function formatAmount(amount: Cents): string {
    return `${(amount / 100).toFixed(2)} EUR`
}
