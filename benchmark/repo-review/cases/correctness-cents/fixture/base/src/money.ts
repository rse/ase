export type Cents = number

export function toCents(euro: number): Cents {
    return Math.round(euro * 100)
}

export function formatEuro(euro: number): string {
    return `${euro.toFixed(2)} EUR`
}
