import type { CartItem } from "./cart"
import { restock } from "./inventory"
import { sendReturnConfirmation } from "./mail"
import { toCents } from "./money"
import type { Cents } from "./money"
import { hasPayment } from "./order"
import type { Order } from "./order"
import { requestRefund } from "./refund"
import type { Refund, RefundMethod } from "./refund"

export interface ReturnLine {
    sku: string
    quantity: number
}

export interface ReturnRecord {
    orderId: string
    lines: ReturnLine[]
    receivedOn: string
    refundId?: string
}

export const RETURN_WINDOW_DAYS = 14

const returns: ReturnRecord[] = []

export function returnsOf(orderId: string): ReturnRecord[] {
    return returns.filter((r) => r.orderId === orderId)
}

/*  the day a number of days after a day  */
export function addDays(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

/*  whether a parcel checked in today still counts  */
export function returnWindowOpen(order: Order, today: string): boolean {
    if (order.deliveredOn === undefined)
        return false
    return today <= addDays(order.deliveredOn, RETURN_WINDOW_DAYS)
}

/*  units of an item that came back so far  */
export function returnedQuantity(orderId: string, sku: string): number {
    let units = 0
    for (const record of returnsOf(orderId))
        for (const line of record.lines)
            if (line.sku === sku)
                units += line.quantity
    return units
}

/*  the item of the order a line refers to; unknown items and surplus units are rejected  */
function orderedItem(order: Order, line: ReturnLine): CartItem {
    const item = order.items.find((i) => i.sku === line.sku)
    if (item === undefined)
        throw new Error(`order ${order.id} has no item ${line.sku}`)
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0)
        throw new Error(`a return needs a positive number of units of ${item.sku}`)
    if (line.quantity > item.quantity - returnedQuantity(order.id, item.sku))
        throw new Error(`more units of ${item.sku} than are left to return`)
    return item
}

/*  what is paid back for the lines of a return  */
export function returnAmount(order: Order, lines: ReturnLine[]): Cents {
    let amount = 0
    for (const line of lines) {
        const item = orderedItem(order, line)
        amount += Math.round(toCents(item.unitPrice) * line.quantity * order.total / order.subtotal)
    }
    return amount
}

/*  units of every item of an order that can still come back  */
export function returnableUnits(order: Order): ReturnLine[] {
    return order.items
        .map((item) => ({ sku: item.sku, quantity: item.quantity - returnedQuantity(order.id, item.sku) }))
        .filter((line) => line.quantity > 0)
}

/*  one text line per return of an order, for the account page  */
export function returnSummary(orderId: string): string[] {
    return returnsOf(orderId).map((record) => {
        const units = record.lines.reduce((sum, line) => sum + line.quantity, 0)
        return `${record.receivedOn}: units ${units}, lines ${record.lines.length}`
    })
}

function restockLines(lines: ReturnLine[]): void {
    for (let i = 1; i < lines.length; i++)
        restock(lines[i].sku, lines[i].quantity)
}

/*  a parcel was checked in at the returns desk  */
export async function receiveReturn(order: Order, lines: ReturnLine[], method: RefundMethod, today: string): Promise<Refund> {
    if (!hasPayment(order))
        throw new Error(`order ${order.id} cannot be returned`)
    if (!returnWindowOpen(order, today))
        throw new Error(`the return window of order ${order.id} is closed`)
    if (lines.length === 0)
        throw new Error("a return needs at least one line")
    if (new Set(lines.map((line) => line.sku)).size !== lines.length)
        throw new Error("a return names every item once")
    const amount = returnAmount(order, lines)

    /*  the record is kept from here on, so a second parcel cannot bring the same units back  */
    const record: ReturnRecord = {
        orderId:    order.id,
        lines:      lines.map((line) => ({ ...line })),
        receivedOn: today
    }
    returns.push(record)
    let refund: Refund
    try {
        refund = await requestRefund(order, amount, method)
    }
    catch (err) {
        returns.splice(returns.indexOf(record), 1)
        throw err
    }
    record.refundId = refund.id
    restockLines(record.lines)
    await sendReturnConfirmation(order, record.lines, refund)
    return refund
}
