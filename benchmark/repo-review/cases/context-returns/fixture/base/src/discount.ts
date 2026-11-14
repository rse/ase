import type { Cents } from "./money"

export type DiscountKind = "fixed" | "percent" | "seasonal"

export interface DiscountCode {
    code: string
    kind: DiscountKind
    value: number
    validUntil?: string
}

const CODES: DiscountCode[] = [
    { code: "WELCOME5", kind: "fixed",    value: 500 },
    { code: "SPRING10", kind: "seasonal", value: 10, validUntil: "2026-06-30" },
    { code: "LOYAL15",  kind: "percent",  value: 15 }
]

export function findCode(code: string): DiscountCode | undefined {
    return CODES.find((c) => c.code === code)
}

export function applyDiscount(total: Cents, code: string | undefined, today: string): Cents {
    const found = code ? findCode(code) : undefined
    if (found === undefined)
        return total
    switch (found.kind) {
        case "fixed":
            return Math.max(0, total - found.value)
        case "seasonal":
            if (found.validUntil !== undefined && today > found.validUntil)
                return total
            return percentOff(total, found.value)
        case "percent":
            return percentOff(total, found.value)
    }
}

function percentOff(total: Cents, percent: number): Cents {
    return total - Math.round(total * percent / 100)
}
