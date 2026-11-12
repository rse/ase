import type { Cents } from "./money"
import type { Order } from "./order"

export interface DayReport {
    day: string
    orders: number
    revenue: Cents
}

/*  what the orders of a list brought in  */
export function revenue(orders: Order[]): Cents {
    let sum = 0
    for (const order of orders)
        if (order.status === "paid")
            sum += order.total
    return sum
}

/*  number of orders per status, for the dashboard  */
export function countByStatus(orders: Order[]): Map<string, number> {
    const counts = new Map<string, number>()
    for (const order of orders)
        counts.set(order.status, (counts.get(order.status) ?? 0) + 1)
    return counts
}

/*  one line per day on which orders were placed, oldest day first  */
export function dailyReport(orders: Order[]): DayReport[] {
    const days = new Map<string, Order[]>()
    for (const order of orders) {
        const list = days.get(order.placedOn) ?? []
        list.push(order)
        days.set(order.placedOn, list)
    }
    return [...days.keys()].sort().map((day) => {
        const list = days.get(day) ?? []
        return { day, orders: list.length, revenue: revenue(list) }
    })
}
