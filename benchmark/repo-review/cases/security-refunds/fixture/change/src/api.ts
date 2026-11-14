import { CartItem, countUnits } from "./cart"
import { formatAmount } from "./money"
import { createOrder, Customer, Order } from "./order"
import { refundOrder } from "./refund"
import { loadOrder } from "./store"

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
        : await createOrder(req.customer, req.items, { tags: [], currency: "EUR", discountCode: req.code })
    return toResponse(order)
}

/*  order details for the account page of a signed-in customer  */
export async function handleGetOrder(query: OrderQuery): Promise<OrderResponse> {
    const order = await loadOrder(query.orderId)
    if (order === undefined)
        throw new Error(`unknown order ${query.orderId}`)
    return toResponse(order)
}

export async function handleRefund(order: Order): Promise<string> {
    const refund = refundOrder(order)
    return `refunded ${formatAmount(refund.amount, refund.currency)}`
}

function toResponse(order: Order): OrderResponse {
    return {
        id:     order.id,
        units:  countUnits(order.items),
        total:  formatAmount(order.total, order.currency),
        status: order.status
    }
}
