import { countUnits } from "./cart"
import type { CartItem } from "./cart"
import { formatAmount } from "./money"
import { createOrder } from "./order"
import type { Customer, Order } from "./order"
import { refundOrder } from "./refund"
import { dailyReport } from "./report"
import { allOrders, loadOrder } from "./store"

export interface OrderRequest {
    customer: Customer
    items: CartItem[]
    code?: string | null
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
}

export async function handleOrder(req: OrderRequest): Promise<OrderResponse> {
    const order = req.code == null
        ? await createOrder(req.customer, req.items)
        : await createOrder(req.customer, req.items, { tags: [], discountCode: req.code })
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
    const refund = refundOrder(await ownOrder(query))
    return `refunded ${formatAmount(refund.amount)}`
}

/*  one text line per day, for the back office  */
export async function handleDailyReport(): Promise<string[]> {
    return dailyReport(await allOrders())
        .map((line) => `${line.day}: ${line.orders} orders, ${formatAmount(line.revenue)}`)
}

function toResponse(order: Order): OrderResponse {
    return {
        id:     order.id,
        units:  countUnits(order.items),
        total:  formatAmount(order.total),
        status: order.status
    }
}
