import { requireAdmin } from "./admin"
import type { User } from "./admin"
import { countUnits } from "./cart"
import type { CartItem } from "./cart"
import { creditBalance, creditStatement } from "./credit"
import { formatAmount } from "./money"
import type { Cents } from "./money"
import { createOrder, hasPayment, statusText } from "./order"
import type { Customer, Order } from "./order"
import { pendingRefunds, refundOrder, refundSummary } from "./refund"
import type { RefundMethod } from "./refund"
import { dailyReport } from "./report"
import { receiveReturn, returnableUnits, returnSummary, returnWindowOpen } from "./returns"
import type { ReturnLine } from "./returns"
import { allOrders, loadOrder } from "./store"

export interface OrderRequest {
    customer: Customer
    items: CartItem[]
    code?: string | null
    payWithCredit?: boolean
}

export interface OrderQuery {
    customerId: string
    orderId: string
}

export interface OrderResponse {
    id: string
    units: number
    total: string
    status: string
    statusText: string
}

export interface ReturnRequest {
    customerId: string
    orderId: string
    lines: ReturnLine[]
    method: RefundMethod
}

export interface RefundStatusResponse {
    orderId: string
    paidBack: string
    onItsWay: string
    left: string
    /*  percent of the order total that was paid back, rounded down to a whole number  */
    share: number
    returns: string[]
}

export interface CreditResponse {
    balance: string
    bookings: string[]
}

export async function handleOrder(req: OrderRequest): Promise<OrderResponse> {
    const order = await createOrder(req.customer, req.items, {
        tags:          [],
        discountCode:  req.code ?? undefined,
        payWithCredit: req.payWithCredit === true
    })
    return toResponse(order)
}

/*  the order of a query, if it belongs to the customer who asks  */
async function ownOrder(query: OrderQuery): Promise<Order> {
    const order = await loadOrder(query.orderId)
    if (order === undefined || order.customer.id !== query.customerId)
        throw new Error(`unknown order ${query.orderId}`)
    return order
}

/*  order details for the account page of a signed-in customer  */
export async function handleGetOrder(query: OrderQuery): Promise<OrderResponse> {
    return toResponse(await ownOrder(query))
}

export async function handleRefund(query: OrderQuery): Promise<string> {
    const refund = await refundOrder(await ownOrder(query))
    return refund.status === "settled"
        ? `refunded ${formatAmount(refund.amount)}`
        : `refund of ${formatAmount(refund.amount)} is on its way`
}

/*  the returns desk checked in a parcel of a customer  */
export async function handleReturn(user: User, req: ReturnRequest, today: string = new Date().toISOString().slice(0, 10)): Promise<string> {
    requireAdmin(user)
    const order  = await ownOrder(req)
    const refund = await receiveReturn(order, req.lines, req.method, today)
    const target = refund.method === "credit" ? "as store credit" : "to the payment method"
    return `return accepted, ${formatAmount(refund.amount)} ${target}`
}

/*  what a customer can still send back today, for the returns form  */
export async function handleReturnOptions(query: OrderQuery, today: string = new Date().toISOString().slice(0, 10)): Promise<ReturnLine[]> {
    const order = await ownOrder(query)
    if (!hasPayment(order) || !returnWindowOpen(order, today))
        return []
    return returnableUnits(order)
}

function refundShare(order: Order, paidBack: Cents): number {
    return Math.floor(100 * paidBack / order.total)
}

/*  what was paid back on an order and what is still on its way, for the account page  */
export async function handleRefundStatus(query: OrderQuery): Promise<RefundStatusResponse> {
    const order   = await ownOrder(query)
    const summary = refundSummary(order)
    return {
        orderId:  order.id,
        paidBack: formatAmount(summary.paidBack),
        onItsWay: formatAmount(summary.onItsWay),
        left:     formatAmount(summary.left),
        share:    refundShare(order, summary.paidBack),
        returns:  returnSummary(order.id)
    }
}

/*  store credit of a signed-in customer  */
export async function handleCredit(customerId: string): Promise<CreditResponse> {
    return {
        balance:  formatAmount(creditBalance(customerId)),
        bookings: creditStatement(customerId)
    }
}

/*  refunds that wait for the payment provider, for the back office  */
export async function handlePendingRefunds(user: User): Promise<string[]> {
    requireAdmin(user)
    return pendingRefunds()
        .map((refund) => `${refund.id}: ${formatAmount(refund.amount)} on order ${refund.orderId}`)
}

/*  one text line per day, for the back office  */
export async function handleDailyReport(): Promise<string[]> {
    return dailyReport(await allOrders())
        .map((line) => `${line.day}: ${line.orders} orders, ${formatAmount(line.revenue)}`)
}

function toResponse(order: Order): OrderResponse {
    return {
        id:         order.id,
        units:      countUnits(order.items),
        total:      formatAmount(order.total),
        status:     order.status,
        statusText: statusText(order)
    }
}
