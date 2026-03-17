## Intent

验证订单请求的完整性和合法性。这是下单流程的第一道防线，确保后续步骤不会因为非法输入而失败。

## Edge Cases

- 空订单（items 数组为空）：直接拒绝，返回 "至少需要一件商品"
- 超大订单（items > 50）：拒绝并建议拆分订单
- 重复商品：同一 product_id 出现多次时合并数量，而非报错
- 零价格商品：允许（赠品场景），但 quantity 必须 > 0
- 地址校验：只校验格式（zip 正则），不做地理有效性验证

## Error Strategy

采用"收集全部错误"策略：不在第一个错误处停止，而是遍历所有字段，收集完整错误列表后一次性返回。这对前端表单展示更友好。

错误格式：`{ field: string, rule: string, message: string }`

## Integration Notes

- 上游：直接接收 HTTP 请求体，无前置处理
- 下游：验证通过后流入 check-inventory，验证失败则直接返回客户端
- 不调用任何外部服务，纯内存计算

## Examples

输入：
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "items": [{ "product_id": "abc-123", "quantity": 2, "price": 29.99 }],
  "email": "user@example.com",
  "shipping_address": { "zip": "100000" }
}
```

输出（通过）：
```json
{ "valid": true, "errors": [] }
```

输出（失败）：
```json
{
  "valid": false,
  "errors": [
    { "field": "request.items[0].product_id", "rule": "uuid", "message": "product_id 必须是 UUID 格式" }
  ]
}
```
