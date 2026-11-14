import { CartItem } from "./cart"
import { formatEuro } from "./money"
import { createOrder, Customer, Order } from "./order"
import { refundOrder } from "./refund"

export interface OrderRequest {
    customer: Customer
    items: CartItem[]
    code?: string
}

export interface OrderResponse {
    id: string
    total: string
}

export async function handleOrder(req: OrderRequest): Promise<OrderResponse> {
    const order = await createOrder(req.customer, req.items, req.code)
    return { id: order.id, total: formatEuro(order.total) }
}

export async function handleRefund(order: Order): Promise<string> {
    const refund = refundOrder(order)
    return `refunded ${formatEuro(refund.amount)}`
}
