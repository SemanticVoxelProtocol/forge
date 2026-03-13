export interface OrderRequest {
  user_id: string
  items: LineItem[]
  email: string
  shipping_address: Address
  coupon_code?: string
}

export interface LineItem {
  product_id: string
  quantity: number
  price: number
}

export interface Address {
  street: string
  city: string
  zip: string
  country: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  code: string
  message: string
}

export interface InventoryStatus {
  available: boolean
  unavailable_items: string[]
}

export interface OrderResult {
  success: boolean
  order_id: string
  total: number
  events: DomainEvent[]
}

export interface DomainEvent {
  type: string
  payload: Record<string, unknown>
  timestamp: number
}
