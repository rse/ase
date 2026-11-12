import { formatAmount } from "./money"
import type { Cents } from "./money"

export interface CreditEntry {
    customerId: string
    /*  positive for credit that was granted, negative for credit that was spent  */
    amount: Cents
    reference: string
}

const balances = new Map<string, Cents>()
const journal: CreditEntry[] = []

export function creditBalance(customerId: string): Cents {
    return balances.get(customerId) ?? 0
}

export function creditHistory(customerId: string): CreditEntry[] {
    return journal.filter((entry) => entry.customerId === customerId)
}

/*  one text line per booking, oldest first, for the account page  */
export function creditStatement(customerId: string): string[] {
    return creditHistory(customerId).map((entry) => {
        const sign = entry.amount < 0 ? "-" : "+"
        return `${sign}${formatAmount(Math.abs(entry.amount))} ${entry.reference}`
    })
}

/*  the journal is written through the booking service, which answers asynchronously  */
async function book(entry: CreditEntry): Promise<void> {
    journal.push(entry)
}

function assertAmount(amount: Cents): void {
    if (!Number.isSafeInteger(amount) || amount <= 0)
        throw new Error("store credit is booked in positive whole cents")
}

export async function grantCredit(customerId: string, amount: Cents, reference: string): Promise<Cents> {
    assertAmount(amount)
    await book({ customerId, amount, reference })
    balances.set(customerId, creditBalance(customerId) + amount)
    return creditBalance(customerId)
}

export async function spendCredit(customerId: string, amount: Cents, reference: string): Promise<Cents> {
    assertAmount(amount)
    const balance = creditBalance(customerId)
    if (amount > balance)
        throw new Error("not enough store credit")
    await book({ customerId, amount: -amount, reference })
    balances.set(customerId, balance - amount)
    return creditBalance(customerId)
}
