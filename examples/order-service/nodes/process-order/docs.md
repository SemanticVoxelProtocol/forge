## Intent

执行订单的核心处理逻辑：计算价格、应用折扣、生成订单记录。这是下单流程的最后一步，前面的验证和库存检查都已通过。

## Edge Cases

- 折扣冲突：VIP 折扣（85 折）和满减折扣（满 200 打 95 折）不叠加，取对用户更优的
- 库存刚好用完：check-inventory 通过但实际扣减时库存不足 → 返回 "库存已变更" 错误
- 并发下单：依赖数据库事务保证一致性，不在应用层做锁
- 零总价订单：允许（全赠品场景），跳过支付通知

## Error Strategy

处理阶段的错误分两类：
1. **可重试错误**（数据库超时、网络抖动）：返回 retryable 标记，上层决定是否重试
2. **业务错误**（库存不足、折扣过期）：返回明确错误码，不重试

所有数据库操作在同一事务中完成。事务失败时全部回滚，不会出现"扣了库存但没生成订单"的情况。

## Integration Notes

- 上游：接收验证通过的 OrderRequest + InventoryStatus
- 下游：成功后发出 OrderCreated 事件（通过事件总线），通知支付服务
- 外部依赖：数据库（事务写入）、事件总线（异步发布）
- 幂等性：基于 request_id 做幂等检查，重复请求返回已有订单

## Examples

输入：
```json
{
  "request": { "user_id": "...", "items": [...], "is_vip": true },
  "inventory": { "available": true, "reserved_until": "2024-01-01T01:00:00Z" }
}
```

输出（成功）：
```json
{
  "success": true,
  "order_id": "ord-550e8400",
  "total": 254.99,
  "discount_applied": "vip_85"
}
```
