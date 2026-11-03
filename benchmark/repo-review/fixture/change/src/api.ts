import { CartItem, countUnits } from "./cart"
import { formatAmount, formatEuro } from "./money"
import { createOrder, Customer, Order } from "./order"
import { refundOrder } from "./refund"

export interface OrderRequest {
    customer: Customer
    items: CartItem[]
    code?: string | null
}

export interface OrderResponse {
    id: string
    units: number
    total: string
}

export async function handleOrder(req: OrderRequest): Promise<OrderResponse> {
    const order = req.code == null
        ? await createOrder(req.customer, req.items)
        : await createOrder(req.customer, req.items, { tags: [], currency: "EUR", discountCode: req.code })
    return toResponse(order)
}

export async function handleRefund(order: Order): Promise<string> {
    const refund = refundOrder(order)
    return `refunded ${formatAmount(refund.amount, refund.currency)}`
}

function toResponse(order: Order): OrderResponse {
    return {
        id:    order.id,
        units: countUnits(order.items),
        total: formatEuro(order.total)
    }
}
