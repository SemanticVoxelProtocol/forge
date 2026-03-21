# OpenSpec：多租户电商 SaaS 平台基准测试规范

> **版本**: 1.0.0
> **日期**: 2026-03-21
> **格式**: 纯 REST API（无前端）

---

## 目录

1. [全局约定](#1-全局约定)
2. [Round 1 — 租户与认证](#round-1--租户与认证)
3. [Round 2 — 商品管理](#round-2--商品管理)
4. [Round 3 — 购物车](#round-3--购物车)
5. [Round 4 — 订单](#round-4--订单)
6. [Round 5 — 支付](#round-5--支付)
7. [Round 6 — 库存管理](#round-6--库存管理)
8. [Round 7 — RBAC 权限控制](#round-7--rbac-权限控制)
9. [Round 8 — 订单状态机](#round-8--订单状态机)
10. [Round 9 — 搜索与筛选](#round-9--搜索与筛选)
11. [Round 10 — 优惠券](#round-10--优惠券)
12. [Round 11 — 租户隔离强化](#round-11--租户隔离强化)
13. [Round 12 — 审计日志](#round-12--审计日志)
14. [Round 13 — 通知系统](#round-13--通知系统)
15. [Round 14 — 批量操作](#round-14--批量操作)
16. [Round 15 — 商品变体（SKU）](#round-15--商品变体sku)
17. [Round 16 — 评价系统](#round-16--评价系统)
18. [Round 17 — 数据看板](#round-17--数据看板)
19. [Round 18 — 退款](#round-18--退款)
20. [Round 19 — 多币种](#round-19--多币种)
21. [Round 20 — API v2 版本化](#round-20--api-v2-版本化)
22. [附录 A — 数据校验汇总](#附录-a--数据校验汇总)
23. [附录 B — HTTP 状态码总览](#附录-b--http-状态码总览)
24. [附录 C — 完整端点清单](#附录-c--完整端点清单)

---

## 1. 全局约定

### 1.1 Base URL

```
http://localhost:3000/api/v1
```

所有端点路径均相对于此 Base URL。当 Round 20 引入 v2 时，v2 端点使用 `http://localhost:3000/api/v2`。

### 1.2 响应信封

所有响应 **必须** 使用统一信封格式：

```json
{
  "data": <T | null>,
  "error": <string | null>
}
```

- 成功时：`data` 包含业务数据，`error` 为 `null`。
- 失败时：`data` 为 `null`，`error` 为人类可读的错误描述字符串。
- 二者 **不得同时非空**，也 **不得同时为空**（始终返回其一）。

分页列表的 `data` 结构：

```json
{
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "limit": 20
  },
  "error": null
}
```

### 1.3 认证

- 使用 JWT Bearer Token，通过 `Authorization: Bearer <token>` 请求头传递。
- 未传 Token 或 Token 无效 → `401 Unauthorized`，`error`: `"Authentication required"`。
- Token 过期 → `401 Unauthorized`，`error`: `"Token expired"`。
- Token 中包含 `userId`、`role`、`tenantId` 声明（claims）。

### 1.4 租户隔离

- 每个请求 **必须** 携带 `X-Tenant-ID` 请求头（公开端点如注册/登录除外）。
- 缺少 `X-Tenant-ID` → `400 Bad Request`，`error`: `"X-Tenant-ID header is required"`。
- Token 中的 `tenantId` 与 `X-Tenant-ID` 不匹配 → `403 Forbidden`，`error`: `"Tenant mismatch"`。
- 所有数据查询 **必须** 自动按 `tenantId` 过滤，确保租户之间完全隔离。

### 1.5 ID 格式

- 所有实体主键均使用 UUID v4 格式（例：`"550e8400-e29b-41d4-a716-446655440000"`）。
- 客户端传入的非法 UUID → `400 Bad Request`，`error`: `"Invalid ID format"`。

### 1.6 时间戳

- 所有时间字段使用 ISO 8601 格式（UTC），精确到毫秒。
- 示例：`"2026-03-21T08:30:00.000Z"`。
- 字段命名约定：`createdAt`、`updatedAt`、`deletedAt`。

### 1.7 金额

- 所有金额以 **整数分（integer cents）** 表示。
- 字段名以 `Cents` 结尾，例如 `priceCents`、`totalCents`、`discountCents`。
- 金额必须 ≥ 0（非负整数）。
- 不同币种的金额 **不可** 直接相加（参见 Round 19）。

### 1.8 分页

- 查询参数：`page`（从 1 开始，默认 1）、`limit`（默认 20，最大 100）。
- `page < 1` → 视为 1。
- `limit < 1` → 视为 1；`limit > 100` → 视为 100。
- 响应中包含 `total`（总记录数）、`page`（当前页）、`limit`（每页条数）。

### 1.9 软删除

- 支持软删除的实体带有 `deletedAt` 字段（`string | null`）。
- 软删除时设置 `deletedAt` 为当前时间戳，**不物理删除**数据行。
- 默认查询 **不返回** 已软删除的记录（`deletedAt !== null`）。
- 需要查询已删除记录时，使用查询参数 `includeDeleted=true`。

### 1.10 HTTP 状态码约定

| 状态码 | 使用场景 |
|--------|----------|
| `200 OK` | GET 成功、PUT/PATCH 更新成功 |
| `201 Created` | POST 创建资源成功 |
| `204 No Content` | DELETE 成功（无响应体） |
| `400 Bad Request` | 请求参数校验失败 |
| `401 Unauthorized` | 未认证或 Token 无效/过期 |
| `403 Forbidden` | 无权限访问（角色不足、租户不匹配） |
| `404 Not Found` | 资源不存在（含已软删除） |
| `409 Conflict` | 业务冲突（重复资源、状态冲突） |
| `422 Unprocessable Entity` | 业务规则校验失败 |
| `429 Too Many Requests` | 请求频率超限 |
| `500 Internal Server Error` | 服务器内部错误 |

---

## Round 1 — 租户与认证

### 需求描述

实现多租户基础设施和用户认证系统。支持租户注册、用户注册、登录和 Token 管理。每个租户拥有独立的用户空间。

### 数据模型

```typescript
interface Tenant {
  id: string;           // UUID v4
  name: string;         // 租户名称，1-100 字符
  slug: string;         // URL 友好标识，唯一，2-50 字符，仅允许 [a-z0-9-]
  plan: "free" | "pro" | "enterprise";
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

interface User {
  id: string;           // UUID v4
  tenantId: string;     // 所属租户 ID
  email: string;        // 合法邮箱格式，租户内唯一
  passwordHash: string; // 不在 API 响应中返回
  name: string;         // 用户显示名称，1-100 字符
  role: "admin" | "seller" | "buyer";
  createdAt: string;
  updatedAt: string;
}

interface AuthTokens {
  accessToken: string;  // JWT，有效期 1 小时
  refreshToken: string; // 有效期 7 天
  expiresIn: number;    // 秒数，3600
}
```

### API 端点

#### POST /tenants

创建新租户。此端点 **不需要认证**。

**Request Body:**

```json
{
  "name": "My Store",
  "slug": "my-store",
  "plan": "free"
}
```

**Response (201):**

```json
{
  "data": {
    "id": "...",
    "name": "My Store",
    "slug": "my-store",
    "plan": "free",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "error": null
}
```

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `name` 缺失或为空 | 400 | `"Name is required"` |
| `name` 超过 100 字符 | 400 | `"Name must be 100 characters or less"` |
| `slug` 缺失或为空 | 400 | `"Slug is required"` |
| `slug` 格式非法 | 400 | `"Slug must contain only lowercase letters, numbers, and hyphens"` |
| `slug` 长度不在 2-50 | 400 | `"Slug must be between 2 and 50 characters"` |
| `slug` 已存在 | 409 | `"Tenant with this slug already exists"` |
| `plan` 不在枚举值中 | 400 | `"Plan must be one of: free, pro, enterprise"` |

#### POST /tenants/:tenantId/users/register

在指定租户下注册新用户。此端点 **不需要认证**，但需要有效的 `tenantId` 路径参数。

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecureP@ss1",
  "name": "张三",
  "role": "buyer"
}
```

**Response (201):**

```json
{
  "data": {
    "id": "...",
    "tenantId": "...",
    "email": "user@example.com",
    "name": "张三",
    "role": "buyer",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "error": null
}
```

> 注意：响应中 **不得** 包含 `passwordHash`。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `tenantId` 对应的租户不存在 | 404 | `"Tenant not found"` |
| `email` 缺失或为空 | 400 | `"Email is required"` |
| `email` 格式不合法 | 400 | `"Invalid email format"` |
| 该租户下 `email` 已注册 | 409 | `"Email already registered in this tenant"` |
| `password` 缺失或为空 | 400 | `"Password is required"` |
| `password` 少于 8 字符 | 400 | `"Password must be at least 8 characters"` |
| `name` 缺失或为空 | 400 | `"Name is required"` |
| `role` 不在枚举值中 | 400 | `"Role must be one of: admin, seller, buyer"` |

#### POST /tenants/:tenantId/users/login

用户登录，返回 JWT Token 对。

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecureP@ss1"
}
```

**Response (200):**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "expiresIn": 3600,
    "user": {
      "id": "...",
      "tenantId": "...",
      "email": "user@example.com",
      "name": "张三",
      "role": "buyer"
    }
  },
  "error": null
}
```

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `tenantId` 对应的租户不存在 | 404 | `"Tenant not found"` |
| `email` 或 `password` 缺失 | 400 | `"Email and password are required"` |
| 邮箱不存在或密码错误 | 401 | `"Invalid email or password"` |

> **安全规则**：无论是邮箱不存在还是密码错误，**始终** 返回相同的错误消息以防止用户枚举。

#### POST /auth/refresh

使用 refreshToken 获取新的 accessToken。

**Request Body:**

```json
{
  "refreshToken": "..."
}
```

**Response (200):**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "expiresIn": 3600
  },
  "error": null
}
```

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `refreshToken` 缺失 | 400 | `"Refresh token is required"` |
| `refreshToken` 无效或过期 | 401 | `"Invalid or expired refresh token"` |

#### GET /users/me

获取当前登录用户信息。**需要认证**。

**Response (200):**

```json
{
  "data": {
    "id": "...",
    "tenantId": "...",
    "email": "user@example.com",
    "name": "张三",
    "role": "buyer",
    "createdAt": "...",
    "updatedAt": "..."
  },
  "error": null
}
```

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R1-BR1 | 租户 slug 全局唯一 | 创建相同 slug 的第二个租户返回 409 |
| R1-BR2 | 用户 email 在同一租户内唯一 | 同一租户下注册相同 email 返回 409 |
| R1-BR3 | 不同租户下相同 email 可以共存 | 在两个不同租户分别注册同一 email 均返回 201 |
| R1-BR4 | 密码不得在任何 API 响应中返回 | 注册和查询用户信息均无 passwordHash 字段 |
| R1-BR5 | accessToken 有效期 1 小时 | Token 中 exp 声明距 iat 为 3600 秒 |
| R1-BR6 | refreshToken 有效期 7 天 | 7 天后使用 refreshToken 返回 401 |
| R1-BR7 | 登录失败不泄露用户是否存在 | 邮箱不存在和密码错误返回相同错误消息 |

### 约束与边界

- **密码存储**：必须使用 bcrypt（cost factor ≥ 10）或同等安全算法哈希存储，严禁明文。
- **JWT 声明**：accessToken 的 payload 必须包含 `userId`、`role`、`tenantId`。
- **并发注册**：两个请求同时注册相同 email → 其中一个成功（201），另一个冲突（409），不得出现数据重复。
- **slug 不可变**：租户创建后 slug 不可更改（无 PUT/PATCH 端点修改 slug）。

### 与已有功能的交互

Round 1 是基础设施，无前序依赖。后续所有 Round 依赖本 Round 提供的：
- 租户注册与 `tenantId`
- 用户注册与认证 Token
- `X-Tenant-ID` 请求头机制

---

## Round 2 — 商品管理

### 需求描述

实现商品的 CRUD 操作。商品属于某个租户下的某个卖家。支持创建、查询（列表+详情）、更新和软删除。

### 数据模型

```typescript
interface Product {
  id: string;             // UUID v4
  tenantId: string;       // 所属租户
  sellerId: string;       // 创建者（seller 角色用户）
  name: string;           // 商品名称，1-200 字符
  description: string;    // 商品描述，0-5000 字符
  priceCents: number;     // 价格（分），正整数 > 0
  currency: string;       // ISO 4217 货币码，默认 "USD"
  status: "draft" | "active" | "archived";
  imageUrls: string[];    // 图片 URL 列表，最多 10 个
  tags: string[];         // 标签列表，每个标签 1-50 字符，最多 20 个
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

### API 端点

#### POST /products

创建新商品。**需要认证**，仅 `seller` 和 `admin` 角色可操作。

**Request Body:**

```json
{
  "name": "无线蓝牙耳机",
  "description": "高品质降噪蓝牙耳机",
  "priceCents": 9999,
  "currency": "USD",
  "status": "draft",
  "imageUrls": ["https://example.com/img1.jpg"],
  "tags": ["electronics", "audio"]
}
```

**Response (201):** 返回完整 Product 对象。`sellerId` 自动设置为当前用户 ID。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 角色为 `buyer` | 403 | `"Only sellers and admins can create products"` |
| `name` 缺失或为空 | 400 | `"Product name is required"` |
| `name` 超过 200 字符 | 400 | `"Product name must be 200 characters or less"` |
| `priceCents` 缺失 | 400 | `"Price is required"` |
| `priceCents` ≤ 0 | 400 | `"Price must be a positive integer"` |
| `priceCents` 非整数 | 400 | `"Price must be a positive integer"` |
| `imageUrls` 超过 10 个 | 400 | `"Maximum 10 image URLs allowed"` |
| `tags` 超过 20 个 | 400 | `"Maximum 20 tags allowed"` |
| `status` 不在枚举值中 | 400 | `"Status must be one of: draft, active, archived"` |

#### GET /products

获取商品列表（仅当前租户、未删除的商品）。**需要认证**。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码（默认 1） |
| `limit` | number | 每页条数（默认 20，最大 100） |
| `status` | string | 按状态过滤 |
| `sellerId` | string | 按卖家过滤 |
| `minPrice` | number | 最低价格（分） |
| `maxPrice` | number | 最高价格（分） |
| `tag` | string | 按标签过滤（精确匹配） |
| `sortBy` | string | 排序字段：`createdAt`（默认）、`priceCents`、`name` |
| `sortOrder` | string | `asc` 或 `desc`（默认 `desc`） |

**Response (200):** 分页信封格式。

#### GET /products/:id

获取单个商品详情。**需要认证**。已软删除的商品返回 404。

**Response (200):** 返回 Product 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `id` 格式非法 | 400 | `"Invalid ID format"` |
| 商品不存在（含已软删除） | 404 | `"Product not found"` |
| 商品属于其他租户 | 404 | `"Product not found"` |

> 注意：跨租户访问也返回 404（而非 403），避免信息泄露。

#### PUT /products/:id

更新商品信息。**需要认证**。仅商品所有者（sellerId）和 `admin` 可操作。

**Request Body:** 与创建相同的字段，全量替换。

**Response (200):** 返回更新后的 Product 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非商品所有者且非 admin | 403 | `"You can only update your own products"` |
| 商品不存在 | 404 | `"Product not found"` |
| （校验错误同创建） | — | — |

#### DELETE /products/:id

软删除商品。**需要认证**。仅商品所有者（sellerId）和 `admin` 可操作。

**Response:** `204 No Content`

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非商品所有者且非 admin | 403 | `"You can only delete your own products"` |
| 商品不存在（含已删除） | 404 | `"Product not found"` |

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R2-BR1 | 只有 seller 和 admin 可创建商品 | buyer 创建商品返回 403 |
| R2-BR2 | 商品自动关联到创建者 | 创建后 sellerId 等于当前用户 ID |
| R2-BR3 | seller 只能修改/删除自己的商品 | seller A 更新 seller B 的商品返回 403 |
| R2-BR4 | admin 可修改/删除任何商品 | admin 更新其他 seller 的商品返回 200 |
| R2-BR5 | 软删除后默认查询不返回 | DELETE 后 GET 列表中不含该商品 |
| R2-BR6 | 跨租户访问返回 404 | 租户 A 的商品对租户 B 不可见 |
| R2-BR7 | 价格必须为正整数 | priceCents=0 或负数返回 400 |

### 约束与边界

- **软删除的商品**不可再次删除（返回 404）。
- **已软删除的商品**无法通过 `GET /products/:id` 访问（返回 404），除非使用 `includeDeleted=true` 参数。
- **商品的 `tenantId`** 自动从 Token 中提取，客户端不可指定。
- **currency 字段**：Round 2 阶段默认为 `"USD"`，不做严格校验。Round 19 将扩展多币种支持。

### 与已有功能的交互

- **Round 1**：依赖认证 Token 和租户隔离机制。
- 后续 Round 3（购物车）、Round 4（订单）将引用商品。

---

## Round 3 — 购物车

### 需求描述

实现购物车功能。每个用户在每个租户下有且仅有一个购物车。支持添加商品、修改数量、移除商品和清空购物车。

### 数据模型

```typescript
interface Cart {
  id: string;             // UUID v4
  tenantId: string;
  userId: string;         // 购物车所有者
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

interface CartItem {
  productId: string;      // 引用 Product.id
  quantity: number;       // 正整数，1-999
  priceCents: number;     // 加入时的商品单价（快照）
  addedAt: string;        // 加入购物车的时间
}
```

### API 端点

#### GET /cart

获取当前用户的购物车。**需要认证**。如果购物车不存在，返回空购物车（自动创建）。

**Response (200):**

```json
{
  "data": {
    "id": "...",
    "tenantId": "...",
    "userId": "...",
    "items": [
      {
        "productId": "...",
        "quantity": 2,
        "priceCents": 9999,
        "addedAt": "..."
      }
    ],
    "totalCents": 19998,
    "itemCount": 2,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "error": null
}
```

> `totalCents` 和 `itemCount` 为计算字段，不存储在数据库中。`totalCents = sum(item.priceCents * item.quantity)`。`itemCount = sum(item.quantity)`。

#### POST /cart/items

向购物车添加商品。**需要认证**。

**Request Body:**

```json
{
  "productId": "...",
  "quantity": 1
}
```

**Response (200):** 返回更新后的完整购物车。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `productId` 缺失 | 400 | `"Product ID is required"` |
| `productId` 对应的商品不存在（或已删除） | 404 | `"Product not found"` |
| 商品状态不是 `active` | 422 | `"Product is not available for purchase"` |
| `quantity` 缺失 | 400 | `"Quantity is required"` |
| `quantity` ≤ 0 | 400 | `"Quantity must be a positive integer"` |
| `quantity` > 999 | 400 | `"Quantity must not exceed 999"` |
| 商品已在购物车中 | 409 | `"Product already in cart. Use PATCH to update quantity"` |

#### PATCH /cart/items/:productId

更新购物车中指定商品的数量。**需要认证**。

**Request Body:**

```json
{
  "quantity": 3
}
```

**Response (200):** 返回更新后的完整购物车。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 该商品不在购物车中 | 404 | `"Item not found in cart"` |
| `quantity` ≤ 0 | 400 | `"Quantity must be a positive integer"` |
| `quantity` > 999 | 400 | `"Quantity must not exceed 999"` |

#### DELETE /cart/items/:productId

从购物车中移除指定商品。**需要认证**。

**Response:** `204 No Content`

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 该商品不在购物车中 | 404 | `"Item not found in cart"` |

#### DELETE /cart

清空购物车中所有商品。**需要认证**。

**Response:** `204 No Content`

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R3-BR1 | 每个用户每个租户只有一个购物车 | GET 始终返回同一个 cart.id |
| R3-BR2 | 不可添加非 active 状态商品 | 添加 draft/archived 商品返回 422 |
| R3-BR3 | 不可添加已删除商品 | 添加已软删除商品返回 404 |
| R3-BR4 | 同一商品不可重复添加 | 已存在的商品再次 POST 返回 409 |
| R3-BR5 | 价格在添加时快照 | 添加后修改商品价格，购物车中价格不变 |
| R3-BR6 | totalCents 正确计算 | sum(priceCents * quantity) 等于响应中的 totalCents |
| R3-BR7 | 清空购物车后 items 为空数组 | DELETE /cart 后 GET 返回 items=[] |

### 约束与边界

- **购物车无过期机制**：购物车不会自动过期或清空。
- **价格快照**：`CartItem.priceCents` 是添加时的价格快照。如果商品价格后续变更，购物车中的价格 **不会自动更新**。
- **跨租户**：用户在不同租户下的购物车完全独立。
- **购物车不存储**：`totalCents` 和 `itemCount` 是计算字段，每次查询时动态计算。

### 与已有功能的交互

- **Round 1**：依赖用户认证。
- **Round 2**：引用商品数据，校验商品状态。
- **Round 4**：购物车商品用于创建订单时，下单后购物车自动清空。

---

## Round 4 — 订单

### 需求描述

实现订单创建和查询。用户可以从购物车下单。订单创建后进入 `pending_payment` 状态。

### 数据模型

```typescript
interface Order {
  id: string;                  // UUID v4
  tenantId: string;
  userId: string;              // 下单用户
  status: "pending_payment" | "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
  items: OrderItem[];
  totalCents: number;          // 订单总金额
  currency: string;            // 货币码
  shippingAddress: Address;
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  productId: string;
  productName: string;         // 下单时快照
  quantity: number;
  priceCents: number;          // 下单时快照
  subtotalCents: number;       // priceCents * quantity
}

interface Address {
  line1: string;               // 1-200 字符
  line2: string | null;        // 0-200 字符
  city: string;                // 1-100 字符
  state: string;               // 1-100 字符
  postalCode: string;          // 1-20 字符
  country: string;             // ISO 3166-1 alpha-2，如 "US"、"CN"
}
```

### API 端点

#### POST /orders

从购物车创建订单。**需要认证**。

**Request Body:**

```json
{
  "shippingAddress": {
    "line1": "123 Main St",
    "line2": "Apt 4B",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "US"
  }
}
```

**Response (201):** 返回完整 Order 对象。

**业务逻辑:**
1. 获取当前用户购物车中的所有商品。
2. 校验所有商品仍为 `active` 状态。
3. 为每个商品创建 OrderItem（快照当前商品名称和价格）。
4. 计算 `totalCents = sum(item.priceCents * item.quantity)`。
5. 创建订单，状态为 `pending_payment`。
6. **清空购物车**。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 购物车为空 | 422 | `"Cart is empty"` |
| 购物车中某商品已下架/删除 | 422 | `"Product '<name>' is no longer available"` |
| 地址 `line1` 缺失 | 400 | `"Shipping address line1 is required"` |
| 地址 `city` 缺失 | 400 | `"Shipping address city is required"` |
| 地址 `state` 缺失 | 400 | `"Shipping address state is required"` |
| 地址 `postalCode` 缺失 | 400 | `"Shipping address postal code is required"` |
| 地址 `country` 缺失 | 400 | `"Shipping address country is required"` |

#### GET /orders

获取当前用户的订单列表。**需要认证**。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 |
| `limit` | number | 每页条数 |
| `status` | string | 按状态过滤 |

**Response (200):** 分页信封格式。

> `admin` 角色可以查看当前租户下所有订单；普通用户只能查看自己的订单。

#### GET /orders/:id

获取单个订单详情。**需要认证**。

**Response (200):** 返回 Order 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 订单不存在 | 404 | `"Order not found"` |
| 非本人订单且非 admin | 403 | `"You can only view your own orders"` |

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R4-BR1 | 下单后购物车清空 | POST /orders 后 GET /cart 返回 items=[] |
| R4-BR2 | 订单金额使用下单时快照 | 下单后修改商品价格，订单金额不变 |
| R4-BR3 | 空购物车不可下单 | 购物车无商品时 POST /orders 返回 422 |
| R4-BR4 | 不可用商品阻止下单 | 购物车中含 archived 商品则下单返回 422 |
| R4-BR5 | 初始状态为 pending_payment | 创建后 status 为 "pending_payment" |
| R4-BR6 | admin 可查看租户内所有订单 | admin GET /orders 返回所有用户订单 |
| R4-BR7 | 普通用户只能查看自己订单 | buyer A 查看 buyer B 订单返回 403 |

### 约束与边界

- **下单原子性**：订单创建和购物车清空必须是原子操作。如果订单创建失败，购物车不应被清空。
- **快照不可变**：OrderItem 中的 `productName` 和 `priceCents` 是下单时的快照，后续商品变更不影响已有订单。
- **currency**：Round 4 阶段订单 currency 继承购物车中商品的 currency（假设全部相同）。Round 19 将处理多币种场景。

### 与已有功能的交互

- **Round 1**：依赖认证和租户隔离。
- **Round 2**：引用商品数据，校验商品状态。
- **Round 3**：从购物车创建订单，下单后清空购物车。
- **Round 5**：订单创建后等待支付。
- **Round 8**：订单状态机将在 Round 8 中完整实现。

---

## Round 5 — 支付

### 需求描述

实现模拟支付处理。提供支付接口处理 `pending_payment` 状态的订单。支付成功后订单转为 `paid` 状态。支持 Webhook 回调通知。

### 数据模型

```typescript
interface Payment {
  id: string;               // UUID v4
  tenantId: string;
  orderId: string;          // 关联的订单 ID
  amountCents: number;      // 支付金额（必须等于订单 totalCents）
  currency: string;
  method: "credit_card" | "debit_card" | "bank_transfer";
  status: "pending" | "completed" | "failed";
  transactionId: string;    // 外部支付系统事务 ID（模拟生成）
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WebhookEvent {
  id: string;               // UUID v4，幂等键
  tenantId: string;
  eventType: "payment.completed" | "payment.failed";
  payload: object;          // Payment 对象
  processedAt: string | null;
  createdAt: string;
}
```

### API 端点

#### POST /orders/:orderId/payments

为订单发起支付。**需要认证**。仅订单所有者可支付。

**Request Body:**

```json
{
  "method": "credit_card"
}
```

**Response (201):** 返回 Payment 对象。

**模拟逻辑:**
- 使用 `method: "credit_card"` 或 `"debit_card"` → 立即成功（status: `"completed"`），订单状态更新为 `paid`。
- 使用 `method: "bank_transfer"` → 状态为 `"pending"`，需要后续 Webhook 确认。
- 模拟生成 `transactionId`（格式：`"txn_" + UUID v4`）。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 订单不存在 | 404 | `"Order not found"` |
| 非订单所有者 | 403 | `"You can only pay for your own orders"` |
| 订单状态不是 `pending_payment` | 422 | `"Order is not awaiting payment"` |
| 该订单已有成功的支付记录 | 409 | `"Payment already completed for this order"` |
| `method` 不在枚举值中 | 400 | `"Payment method must be one of: credit_card, debit_card, bank_transfer"` |

#### POST /webhooks/payments

接收支付 Webhook 回调。**不需要用户认证**（但需要验证 Webhook 签名——本规范中使用固定密钥 `"webhook_secret_key"` 通过 `X-Webhook-Signature` 请求头验证 HMAC-SHA256 签名）。

**Request Body:**

```json
{
  "eventId": "...",
  "eventType": "payment.completed",
  "payload": {
    "paymentId": "...",
    "orderId": "...",
    "transactionId": "txn_..."
  }
}
```

**Response (200):**

```json
{
  "data": { "received": true },
  "error": null
}
```

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 签名缺失或无效 | 401 | `"Invalid webhook signature"` |
| `eventId` 已处理（幂等） | 200 | 返回 `{ "data": { "received": true, "duplicate": true }, "error": null }`（不重复处理） |

#### GET /orders/:orderId/payments

获取订单的支付记录列表。**需要认证**。

**Response (200):** 返回 Payment 数组。

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R5-BR1 | 信用卡/借记卡立即完成 | 使用 credit_card 支付后 Payment.status="completed"，Order.status="paid" |
| R5-BR2 | 银行转账需 Webhook 确认 | 使用 bank_transfer 支付后 Payment.status="pending"，Order.status 不变 |
| R5-BR3 | Webhook 确认后更新状态 | 发送 payment.completed Webhook 后 Order.status 变为 "paid" |
| R5-BR4 | Webhook 幂等处理 | 同一 eventId 发送两次，第二次返回 duplicate=true |
| R5-BR5 | 不可为非 pending_payment 订单支付 | 已支付订单再次支付返回 422 |
| R5-BR6 | 支付金额必须等于订单总额 | Payment.amountCents 始终等于 Order.totalCents |
| R5-BR7 | 仅订单所有者可支付 | 其他用户为他人订单支付返回 403 |

### 约束与边界

- **幂等性**：Webhook 处理必须幂等。相同 `eventId` 多次推送只处理一次。
- **Webhook 签名**：使用 HMAC-SHA256，密钥为 `"webhook_secret_key"`。签名计算基于请求体的 JSON 字符串。
- **支付不可取消**：一旦支付完成（`completed`），无法通过支付接口撤销（退款在 Round 18 中实现）。
- **并发支付**：同一订单的两个并发支付请求 → 一个成功，另一个返回 409。

### 与已有功能的交互

- **Round 4**：依赖订单数据。支付成功后更新订单状态。
- **Round 8**：支付状态变更触发订单状态机转移。
- **Round 18**：退款功能将反向操作支付记录。

---

## Round 6 — 库存管理

### 需求描述

为商品添加库存管理功能。跟踪库存数量，下单时原子扣减库存，订单取消时回滚库存。

### 数据模型

```typescript
interface Inventory {
  productId: string;       // 引用 Product.id（一对一）
  tenantId: string;
  quantity: number;        // 当前可用库存，非负整数
  reservedQuantity: number; // 已预留（未完成订单中）的数量
  updatedAt: string;
}

interface InventoryLog {
  id: string;              // UUID v4
  productId: string;
  tenantId: string;
  type: "increase" | "decrease" | "reserve" | "release" | "adjustment";
  quantity: number;         // 变动数量（正整数）
  reason: string;           // 变动原因
  referenceId: string | null; // 关联的订单 ID 或其他引用
  createdAt: string;
}
```

### API 端点

#### PUT /products/:productId/inventory

设置/更新商品库存。**需要认证**，仅 `seller`（商品所有者）和 `admin` 可操作。

**Request Body:**

```json
{
  "quantity": 100
}
```

**Response (200):** 返回 Inventory 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 商品不存在 | 404 | `"Product not found"` |
| 非商品所有者且非 admin | 403 | `"You can only manage inventory for your own products"` |
| `quantity` 缺失 | 400 | `"Quantity is required"` |
| `quantity` < 0 | 400 | `"Quantity must be a non-negative integer"` |
| `quantity` 非整数 | 400 | `"Quantity must be a non-negative integer"` |

#### GET /products/:productId/inventory

获取商品库存信息。**需要认证**。

**Response (200):** 返回 Inventory 对象。

#### GET /products/:productId/inventory/logs

获取库存变动日志。**需要认证**，仅 `seller`（商品所有者）和 `admin` 可查看。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 |
| `limit` | number | 每页条数 |
| `type` | string | 按变动类型过滤 |

**Response (200):** 分页信封格式，返回 InventoryLog 数组。

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R6-BR1 | 下单时原子扣减库存 | 下单后 inventory.quantity 减少相应数量 |
| R6-BR2 | 库存不足时不可下单 | 库存=5 时下单数量=10 返回 422 |
| R6-BR3 | 订单取消时回滚库存 | 取消订单后 inventory.quantity 恢复 |
| R6-BR4 | 库存变动记录完整 | 每次库存变动产生对应 InventoryLog |
| R6-BR5 | 库存不可为负数 | 设置 quantity < 0 返回 400 |
| R6-BR6 | 并发扣减安全 | 两个并发订单争抢最后 1 个库存 → 一个成功，另一个 422 |

### 约束与边界

- **原子扣减**：库存扣减必须使用数据库级别的原子操作（如 `UPDATE ... WHERE quantity >= required_quantity`），避免超卖。
- **并发安全**：两个订单同时争抢有限库存时，必须确保不会超卖。一个成功（201），另一个返回 `422 Unprocessable Entity`，`error`: `"Insufficient inventory for product '<name>'"`.
- **库存日志不可变**：InventoryLog 一旦创建不可修改或删除。
- **初始库存**：商品创建时不自动创建库存记录。首次通过 `PUT /products/:id/inventory` 初始化。
- **未初始化库存**：商品若无库存记录，视为库存为 0，下单该商品返回 422。

### 与已有功能的交互

- **Round 2**：库存与商品一对一关联。
- **Round 4**：下单时扣减库存。下单流程需增加库存校验步骤。
  - 修改 `POST /orders`：下单时先检查库存，不足则返回 `422`，`error`: `"Insufficient inventory for product '<name>'"`.
- **Round 8**：订单取消时回滚库存。

---

## Round 7 — RBAC 权限控制

### 需求描述

细化角色权限控制。明确 admin、seller、buyer 三种角色的权限边界，增加权限检查中间件。

### 数据模型

无新增数据模型。权限基于现有 User.role 字段。

### 权限矩阵

| 操作 | admin | seller | buyer |
|------|-------|--------|-------|
| 创建商品 | ✅ | ✅ | ❌ |
| 更新商品 | ✅（所有） | ✅（自己的） | ❌ |
| 删除商品 | ✅（所有） | ✅（自己的） | ❌ |
| 查看商品列表 | ✅ | ✅ | ✅ |
| 查看商品详情 | ✅ | ✅ | ✅ |
| 管理库存 | ✅（所有） | ✅（自己的） | ❌ |
| 操作购物车 | ✅ | ✅ | ✅ |
| 创建订单 | ✅ | ✅ | ✅ |
| 查看所有订单 | ✅ | ❌ | ❌ |
| 查看自己订单 | ✅ | ✅ | ✅ |
| 管理用户 | ✅ | ❌ | ❌ |

### API 端点

#### GET /users

获取当前租户下所有用户列表。**需要认证**，仅 `admin` 可操作。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 |
| `limit` | number | 每页条数 |
| `role` | string | 按角色过滤 |

**Response (200):** 分页信封格式。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin 角色 | 403 | `"Admin access required"` |

#### PATCH /users/:id/role

修改用户角色。**需要认证**，仅 `admin` 可操作。

**Request Body:**

```json
{
  "role": "seller"
}
```

**Response (200):** 返回更新后的 User 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin 角色 | 403 | `"Admin access required"` |
| 用户不存在 | 404 | `"User not found"` |
| `role` 不在枚举值中 | 400 | `"Role must be one of: admin, seller, buyer"` |
| 修改自己的角色 | 422 | `"Cannot change your own role"` |

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R7-BR1 | buyer 不可创建商品 | buyer POST /products 返回 403 |
| R7-BR2 | seller 不可管理他人商品 | seller A 更新 seller B 商品返回 403 |
| R7-BR3 | admin 可管理所有资源 | admin 更新任意商品返回 200 |
| R7-BR4 | admin 不可修改自己角色 | admin PATCH 自己角色返回 422 |
| R7-BR5 | 非 admin 不可查看用户列表 | seller/buyer GET /users 返回 403 |
| R7-BR6 | 角色变更立即生效 | 变更角色后新 Token 中角色已更新 |

### 约束与边界

- **角色不可跨租户**：角色修改仅限当前租户内的用户。
- **至少保留一个 admin**：如果租户内只有一个 admin，不可将其降级为其他角色。→ `422 Unprocessable Entity`，`error`: `"Cannot remove the last admin of the tenant"`。
- **角色修改不吊销现有 Token**：角色修改后，旧 Token 在过期前仍然有效（携带旧角色）。新的 Token 将反映新角色。

### 与已有功能的交互

- **Round 1**：基于 User.role 实现权限控制。
- **Round 2**：商品操作的权限检查。
- **Round 6**：库存管理的权限检查。
- 后续所有 Round 的权限检查均遵循此矩阵。

---

## Round 8 — 订单状态机

### 需求描述

实现完整的订单状态机，定义所有合法的状态转移路径，支持发货、确认收货和取消订单操作。

### 状态转移图

```
pending_payment → paid → shipped → delivered
       ↓            ↓
   cancelled    cancelled
                    ↓
                 refunded (Round 18)
```

合法的状态转移：

| 当前状态 | 可转移到 | 触发条件 |
|----------|----------|----------|
| `pending_payment` | `paid` | 支付完成（Round 5） |
| `pending_payment` | `cancelled` | 用户/admin 取消 |
| `paid` | `shipped` | seller/admin 发货 |
| `paid` | `cancelled` | admin 取消 |
| `paid` | `refunded` | 退款完成（Round 18） |
| `shipped` | `delivered` | buyer/admin 确认收货 |

### API 端点

#### POST /orders/:id/ship

标记订单为已发货。**需要认证**，仅 `seller`（订单中商品的卖家）和 `admin` 可操作。

**Request Body:**

```json
{
  "trackingNumber": "SF1234567890",
  "carrier": "SF Express"
}
```

**Response (200):** 返回更新后的 Order 对象（新增 `trackingNumber` 和 `carrier` 字段）。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 订单不存在 | 404 | `"Order not found"` |
| 订单状态不是 `paid` | 422 | `"Order can only be shipped when in 'paid' status"` |
| 非 seller/admin | 403 | `"Only the seller or admin can ship orders"` |
| `trackingNumber` 缺失 | 400 | `"Tracking number is required"` |

#### POST /orders/:id/deliver

确认收货。**需要认证**，仅订单所有者（buyer）和 `admin` 可操作。

**Response (200):** 返回更新后的 Order 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 订单不存在 | 404 | `"Order not found"` |
| 订单状态不是 `shipped` | 422 | `"Order can only be delivered when in 'shipped' status"` |
| 非订单所有者且非 admin | 403 | `"Only the buyer or admin can confirm delivery"` |

#### POST /orders/:id/cancel

取消订单。**需要认证**。

**Request Body:**

```json
{
  "reason": "不需要了"
}
```

**Response (200):** 返回更新后的 Order 对象（新增 `cancellationReason` 字段）。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 订单不存在 | 404 | `"Order not found"` |
| 订单状态不允许取消 | 422 | `"Order in '<status>' status cannot be cancelled"` |
| buyer 取消非 pending_payment 订单 | 403 | `"Buyers can only cancel orders in 'pending_payment' status"` |
| `reason` 缺失 | 400 | `"Cancellation reason is required"` |

**取消权限:**
- `buyer`（订单所有者）：仅可取消 `pending_payment` 状态的订单。
- `admin`：可取消 `pending_payment` 和 `paid` 状态的订单。

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R8-BR1 | 非法状态转移被拒绝 | pending_payment → shipped 返回 422 |
| R8-BR2 | 已发货不可取消 | shipped 状态订单取消返回 422 |
| R8-BR3 | 已送达不可取消 | delivered 状态订单取消返回 422 |
| R8-BR4 | buyer 仅可取消待支付订单 | buyer 取消 paid 订单返回 403 |
| R8-BR5 | admin 可取消 paid 订单 | admin 取消 paid 订单返回 200 |
| R8-BR6 | 取消已支付订单触发库存回滚 | 取消 paid 订单后库存恢复 |
| R8-BR7 | 每次状态变更记录时间戳 | Order.updatedAt 在每次状态变更后更新 |

### 约束与边界

- **已送达订单**是终态之一，不可再转移（退款场景由 Round 18 处理）。
- **取消已支付订单**时必须回滚库存（与 Round 6 联动）。
- **取消待支付订单**无需库存回滚（因为待支付状态可能还未扣减库存——取决于实现策略；本规范假设下单时即扣减库存）。
- 状态变更必须原子操作，避免并发请求导致非法状态。

### 与已有功能的交互

- **Round 4**：扩展订单数据模型，增加 `trackingNumber`、`carrier`、`cancellationReason` 字段。
- **Round 5**：支付完成触发 `pending_payment → paid` 转移。
- **Round 6**：取消订单时回滚库存。
- **Round 18**：退款触发 `paid → refunded` 转移。

---

## Round 9 — 搜索与筛选

### 需求描述

为商品列表添加全文搜索和高级筛选功能。

### 数据模型

本轮无新增数据模型。在现有 Product 的基础上增加查询能力，不改变存储结构。

### API 端点

#### GET /products/search

全文搜索商品。**需要认证**。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索关键词（搜索 name 和 description 字段） |
| `page` | number | 页码 |
| `limit` | number | 每页条数 |
| `status` | string | 按状态过滤（默认仅 active） |
| `minPrice` | number | 最低价格（分） |
| `maxPrice` | number | 最高价格（分） |
| `tags` | string | 逗号分隔的标签列表（AND 逻辑：商品必须包含所有指定标签） |
| `sellerId` | string | 按卖家过滤 |
| `sortBy` | string | `relevance`（默认）、`priceCents`、`createdAt`、`name` |
| `sortOrder` | string | `asc` 或 `desc`（默认 `desc`） |

**Response (200):** 分页信封格式。搜索结果中可选包含 `_score` 字段表示相关性得分。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `q` 缺失或为空 | 400 | `"Search query is required"` |
| `q` 超过 200 字符 | 400 | `"Search query must be 200 characters or less"` |
| `minPrice` > `maxPrice` | 400 | `"minPrice must be less than or equal to maxPrice"` |

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R9-BR1 | 搜索仅返回当前租户商品 | 搜索结果不含其他租户的商品 |
| R9-BR2 | 默认不含已删除商品 | 搜索结果不含 deletedAt 非空的商品 |
| R9-BR3 | 按关键词搜索 name 和 description | 关键词出现在 description 中也能被搜到 |
| R9-BR4 | tags 为 AND 逻辑 | tags=a,b 仅返回同时包含 a 和 b 的商品 |
| R9-BR5 | 价格区间正确过滤 | minPrice=1000&maxPrice=5000 仅返回该区间的商品 |
| R9-BR6 | 不区分大小写搜索 | 搜索 "iphone" 能匹配 "iPhone" |
| R9-BR7 | 空结果返回空数组 | 无匹配商品返回 items=[], total=0 |

### 约束与边界

- **搜索性能**：全文搜索可使用简单的 LIKE/ILIKE 实现，不要求使用 Elasticsearch 等外部搜索引擎。
- **搜索范围**：仅搜索 `name` 和 `description` 两个字段。
- **排序**：`relevance` 排序时，`name` 匹配优先于 `description` 匹配。
- **空搜索**：`q` 参数为空字符串时返回 400 错误。

### 与已有功能的交互

- **Round 2**：扩展商品查询能力。
- 与 Round 11（租户隔离）联动，确保搜索结果严格按租户隔离。

---

## Round 10 — 优惠券

### 需求描述

实现优惠券系统。支持固定金额和百分比折扣。优惠券可应用于订单，下单时减免金额。

### 数据模型

```typescript
interface Coupon {
  id: string;                  // UUID v4
  tenantId: string;
  code: string;                // 优惠券码，租户内唯一，1-50 字符，大写字母和数字
  type: "fixed" | "percentage";
  valueCents: number | null;   // type=fixed 时的减免金额（分）
  valuePercent: number | null; // type=percentage 时的折扣百分比（1-100）
  minOrderCents: number;       // 最低订单金额（分），0 表示无限制
  maxDiscountCents: number | null; // type=percentage 时的最大折扣金额（分），null 表示无上限
  usageLimit: number | null;   // 最大使用次数，null 表示无限
  usedCount: number;           // 已使用次数
  validFrom: string;           // 生效时间
  validUntil: string;          // 失效时间
  isActive: boolean;           // 是否启用
  createdAt: string;
  updatedAt: string;
}
```

### API 端点

#### POST /coupons

创建优惠券。**需要认证**，仅 `admin` 可操作。

**Request Body:**

```json
{
  "code": "SAVE20",
  "type": "percentage",
  "valuePercent": 20,
  "minOrderCents": 5000,
  "maxDiscountCents": 2000,
  "usageLimit": 100,
  "validFrom": "2026-01-01T00:00:00.000Z",
  "validUntil": "2026-12-31T23:59:59.999Z",
  "isActive": true
}
```

**Response (201):** 返回 Coupon 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin | 403 | `"Admin access required"` |
| `code` 缺失或为空 | 400 | `"Coupon code is required"` |
| `code` 格式非法 | 400 | `"Coupon code must contain only uppercase letters and numbers"` |
| `code` 已存在 | 409 | `"Coupon code already exists"` |
| `type` 不在枚举值中 | 400 | `"Coupon type must be one of: fixed, percentage"` |
| `type=fixed` 但 `valueCents` 缺失或 ≤ 0 | 400 | `"Fixed coupon must have a positive value"` |
| `type=percentage` 但 `valuePercent` 不在 1-100 | 400 | `"Percentage must be between 1 and 100"` |
| `validFrom` >= `validUntil` | 400 | `"validFrom must be before validUntil"` |

#### GET /coupons

获取优惠券列表。**需要认证**，仅 `admin` 可操作。

**Response (200):** 分页信封格式。

#### POST /coupons/validate

验证优惠券是否可用。**需要认证**（任何角色）。

**Request Body:**

```json
{
  "code": "SAVE20",
  "orderTotalCents": 10000
}
```

**Response (200):**

```json
{
  "data": {
    "valid": true,
    "discountCents": 2000,
    "coupon": { ... }
  },
  "error": null
}
```

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 优惠券码不存在 | 404 | `"Coupon not found"` |
| 优惠券未启用 | 422 | `"Coupon is not active"` |
| 优惠券未到生效时间 | 422 | `"Coupon is not yet valid"` |
| 优惠券已过期 | 422 | `"Coupon has expired"` |
| 使用次数已达上限 | 422 | `"Coupon usage limit reached"` |
| 订单金额不满足最低要求 | 422 | `"Order total must be at least <minOrderCents> cents"` |

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R10-BR1 | 固定金额折扣正确计算 | 10000 分订单使用 2000 分优惠券 → discountCents=2000 |
| R10-BR2 | 百分比折扣正确计算 | 10000 分订单使用 20% 优惠券 → discountCents=2000 |
| R10-BR3 | 百分比折扣有上限 | maxDiscountCents=1500 时 20% 的 10000 → discountCents=1500 |
| R10-BR4 | 折扣不超过订单金额 | 5000 分订单使用 10000 分优惠券 → discountCents=5000 |
| R10-BR5 | 优惠券码不区分大小写验证 | 输入 "save20" 能匹配 "SAVE20" |
| R10-BR6 | 使用次数递增 | 订单使用优惠券后 usedCount += 1 |
| R10-BR7 | 过期优惠券不可使用 | validUntil 已过时验证返回 422 |

### 约束与边界

- **优惠券与订单**：下单时可选传入 `couponCode`。如果传入，先验证优惠券，再计算折扣后的 `totalCents`。
  - 修改 `POST /orders` Request Body，增加可选字段 `couponCode`。
  - 订单中新增字段 `couponId`（string | null）和 `discountCents`（number，默认 0）。
  - `totalCents` = 商品总额 - `discountCents`。
- **每笔订单最多使用一张优惠券**。
- **并发使用**：usageLimit=1 的优惠券被两个并发订单使用 → 一个成功，另一个返回 422。

### 与已有功能的交互

- **Round 4**：扩展订单模型，增加 `couponId` 和 `discountCents`。
- **Round 8**：订单取消时，如果使用了优惠券，`usedCount` 需要 -1。

---

## Round 11 — 租户隔离强化

### 需求描述

强化租户数据隔离，确保所有已有端点严格遵守租户边界。添加租户级别的配置管理。

### 数据模型

```typescript
interface TenantConfig {
  tenantId: string;
  maxProductsPerSeller: number;   // 默认 1000
  maxOrdersPerDay: number;        // 默认 100
  allowedCurrencies: string[];    // 默认 ["USD"]
  taxRate: number;                // 税率百分比（0-100），默认 0
  updatedAt: string;
}
```

### API 端点

#### GET /tenant/config

获取当前租户配置。**需要认证**，仅 `admin` 可操作。

**Response (200):** 返回 TenantConfig 对象。

#### PATCH /tenant/config

更新租户配置。**需要认证**，仅 `admin` 可操作。

**Request Body（部分更新）:**

```json
{
  "maxProductsPerSeller": 500,
  "allowedCurrencies": ["USD", "EUR"]
}
```

**Response (200):** 返回更新后的 TenantConfig 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin | 403 | `"Admin access required"` |
| `maxProductsPerSeller` ≤ 0 | 400 | `"maxProductsPerSeller must be a positive integer"` |
| `maxOrdersPerDay` ≤ 0 | 400 | `"maxOrdersPerDay must be a positive integer"` |
| `taxRate` 不在 0-100 | 400 | `"Tax rate must be between 0 and 100"` |

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R11-BR1 | 跨租户数据完全不可访问 | 租户 A 无法通过任何端点访问租户 B 数据 |
| R11-BR2 | 商品数量受租户配置限制 | 超过 maxProductsPerSeller 创建商品返回 422 |
| R11-BR3 | 每日订单数受限制 | 超过 maxOrdersPerDay 下单返回 422 |
| R11-BR4 | 租户配置影响业务逻辑 | 修改 taxRate 后新订单包含税费计算 |
| R11-BR5 | X-Tenant-ID 不匹配返回 403 | Token tenantId 与 Header 不一致返回 403 |
| R11-BR6 | 新租户自动创建默认配置 | 创建租户后 GET /tenant/config 返回默认值 |

### 约束与边界

- **租户隔离审计**：本 Round 要求回顾所有已有端点，确保每个数据查询都包含 `tenantId` 过滤条件。
- **跨租户 ID 猜测**：即使知道其他租户的资源 ID，也应返回 404（而非 403），防止资源枚举。
- **商品数量限制**：seller 创建商品时检查当前商品数（不含已删除）是否超过 `maxProductsPerSeller`。超过时返回 `422 Unprocessable Entity`，`error`: `"Product limit reached for this tenant (<limit>)"`.
- **订单频率限制**：用户当日（UTC 日期）订单数超过 `maxOrdersPerDay` 时返回 `422`，`error`: `"Daily order limit reached (<limit>)"`.
- **税费计算**：若 `taxRate > 0`，订单新增字段 `taxCents = floor(subtotal * taxRate / 100)`，`totalCents = subtotal - discountCents + taxCents`。

### 与已有功能的交互

- **Round 1**：强化租户创建时的默认配置初始化。
- **Round 2**：商品创建时校验商品数量限制。
- **Round 4**：下单时校验每日订单限制和税费计算。
- **Round 10**：优惠券折扣后再计算税费。
- 所有已有 Round 的端点需确认租户隔离正确性。

---

## Round 12 — 审计日志

### 需求描述

实现审计日志系统。自动记录所有关键业务操作（创建、更新、删除、状态变更），支持查询和过滤。

### 数据模型

```typescript
interface AuditLog {
  id: string;                  // UUID v4
  tenantId: string;
  userId: string;              // 操作者
  action: string;              // 操作类型，如 "product.created"、"order.status_changed"
  entityType: string;          // 实体类型，如 "product"、"order"、"user"
  entityId: string;            // 实体 ID
  changes: object | null;      // 变更详情（旧值 → 新值）
  metadata: object | null;     // 附加信息（IP、User-Agent 等）
  createdAt: string;
}
```

### 需要记录的操作

| action | entityType | 触发场景 |
|--------|-----------|----------|
| `tenant.created` | tenant | 创建租户 |
| `user.registered` | user | 用户注册 |
| `user.login` | user | 用户登录（成功） |
| `user.role_changed` | user | 用户角色变更 |
| `product.created` | product | 创建商品 |
| `product.updated` | product | 更新商品 |
| `product.deleted` | product | 删除商品（软删除） |
| `order.created` | order | 创建订单 |
| `order.status_changed` | order | 订单状态变更 |
| `payment.created` | payment | 创建支付 |
| `inventory.updated` | inventory | 库存变更 |
| `coupon.created` | coupon | 创建优惠券 |
| `coupon.used` | coupon | 优惠券被使用 |

### API 端点

#### GET /audit-logs

查询审计日志。**需要认证**，仅 `admin` 可操作。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 |
| `limit` | number | 每页条数 |
| `action` | string | 按操作类型过滤 |
| `entityType` | string | 按实体类型过滤 |
| `entityId` | string | 按实体 ID 过滤 |
| `userId` | string | 按操作者过滤 |
| `startDate` | string | 起始时间（ISO 8601） |
| `endDate` | string | 结束时间（ISO 8601） |

**Response (200):** 分页信封格式。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin | 403 | `"Admin access required"` |
| `startDate` 格式无效 | 400 | `"Invalid date format for startDate"` |
| `endDate` 格式无效 | 400 | `"Invalid date format for endDate"` |
| `startDate` > `endDate` | 400 | `"startDate must be before endDate"` |

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R12-BR1 | 所有关键操作都有审计记录 | 创建商品后查询审计日志包含 product.created |
| R12-BR2 | 审计日志包含变更详情 | 更新商品后 changes 字段包含旧值和新值 |
| R12-BR3 | 审计日志不可修改或删除 | 无 PUT/PATCH/DELETE 端点 |
| R12-BR4 | 审计日志按租户隔离 | 租户 A 无法查看租户 B 的审计日志 |
| R12-BR5 | 支持按时间范围查询 | startDate=X&endDate=Y 仅返回该范围内的日志 |
| R12-BR6 | 登录操作记录 IP 信息 | user.login 的 metadata 包含 IP 字段 |

### 约束与边界

- **审计日志不可变**：一旦创建，不可修改或删除。无 PUT、PATCH、DELETE 端点。
- **异步写入**：审计日志写入 **不应** 阻塞主业务逻辑。写入失败时记录到错误日志，但不影响业务操作返回。
- **changes 字段格式**：`{ "field1": { "old": "value1", "new": "value2" }, ... }`。
- **审计日志存储**：审计日志无软删除机制，永久保存。

### 与已有功能的交互

- 需要在 **所有已有 Round 的关键操作** 中注入审计日志写入逻辑。
- 审计日志本身的写入 **不** 产生新的审计日志（避免无限递归）。

---

## Round 13 — 通知系统

### 需求描述

实现应用内通知系统。关键业务事件（订单状态变更、支付完成等）自动生成通知。用户可以查看和标记通知为已读。

### 数据模型

```typescript
interface Notification {
  id: string;               // UUID v4
  tenantId: string;
  userId: string;           // 接收者
  type: string;             // 通知类型
  title: string;            // 标题
  message: string;          // 正文
  referenceType: string | null;  // 关联实体类型
  referenceId: string | null;    // 关联实体 ID
  isRead: boolean;          // 是否已读
  readAt: string | null;    // 已读时间
  createdAt: string;
}
```

### 通知触发规则

| 事件 | 接收者 | type | title 模板 |
|------|--------|------|-----------|
| 订单创建 | buyer | `order.created` | `"Order <orderId> has been placed"` |
| 支付完成 | buyer | `payment.completed` | `"Payment for order <orderId> completed"` |
| 订单发货 | buyer | `order.shipped` | `"Order <orderId> has been shipped"` |
| 订单送达 | seller | `order.delivered` | `"Order <orderId> has been delivered"` |
| 订单取消 | buyer + seller | `order.cancelled` | `"Order <orderId> has been cancelled"` |
| 库存不足 | seller | `inventory.low` | `"Low inventory alert for product '<name>'"` |

> 库存不足通知：当库存 ≤ 10 时触发（每个商品每 24 小时最多一次）。

### API 端点

#### GET /notifications

获取当前用户的通知列表。**需要认证**。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 |
| `limit` | number | 每页条数 |
| `isRead` | boolean | 按已读状态过滤 |
| `type` | string | 按通知类型过滤 |

**Response (200):** 分页信封格式。额外包含 `unreadCount` 字段。

```json
{
  "data": {
    "items": [...],
    "total": 50,
    "page": 1,
    "limit": 20,
    "unreadCount": 5
  },
  "error": null
}
```

#### PATCH /notifications/:id/read

标记通知为已读。**需要认证**。

**Response (200):** 返回更新后的 Notification 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 通知不存在 | 404 | `"Notification not found"` |
| 非通知接收者 | 403 | `"You can only read your own notifications"` |

#### POST /notifications/read-all

标记所有未读通知为已读。**需要认证**。

**Response (200):**

```json
{
  "data": { "updatedCount": 5 },
  "error": null
}
```

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R13-BR1 | 订单创建生成通知 | 下单后 buyer 的通知列表包含 order.created |
| R13-BR2 | 通知按租户隔离 | 不同租户用户的通知列表独立 |
| R13-BR3 | 标记已读后 isRead=true | PATCH 后 isRead 字段为 true |
| R13-BR4 | 批量已读返回更新数量 | read-all 返回正确的 updatedCount |
| R13-BR5 | unreadCount 正确计算 | 标记一条已读后 unreadCount 减 1 |
| R13-BR6 | 库存通知 24 小时去重 | 同一商品 24 小时内不重复发库存通知 |

### 约束与边界

- **通知不可删除**：用户只能标记已读，不可删除通知。
- **异步生成**：通知生成 **不应** 阻塞主业务逻辑。
- **通知无过期**：通知永久保存。
- **unreadCount** 仅统计当前用户未读通知总数（不分页）。

### 与已有功能的交互

- **Round 4**：订单创建事件。
- **Round 5**：支付完成事件。
- **Round 6**：库存不足事件。
- **Round 8**：订单状态变更事件。

---

## Round 14 — 批量操作

### 需求描述

支持批量创建、更新和删除商品。使用部分成功模式——单个商品失败不影响其他商品的处理。

### 数据模型

本轮无新增数据模型。批量操作复用现有 Product 模型，响应中使用内联的结果/错误结构（见 API 端点部分）。

### API 端点

#### POST /products/batch

批量创建商品。**需要认证**，仅 `seller` 和 `admin` 可操作。

**Request Body:**

```json
{
  "products": [
    { "name": "商品A", "priceCents": 1000, "description": "..." },
    { "name": "商品B", "priceCents": 2000, "description": "..." },
    { "name": "", "priceCents": -1, "description": "..." }
  ]
}
```

**Response (200):**（注意：即使部分失败也返回 200）

```json
{
  "data": {
    "results": [
      { "index": 0, "success": true, "data": { "id": "...", ... } },
      { "index": 1, "success": true, "data": { "id": "...", ... } },
      { "index": 2, "success": false, "error": "Product name is required" }
    ],
    "summary": {
      "total": 3,
      "succeeded": 2,
      "failed": 1
    }
  },
  "error": null
}
```

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| `products` 缺失或非数组 | 400 | `"Products array is required"` |
| `products` 为空数组 | 400 | `"Products array must not be empty"` |
| `products` 超过 100 个 | 400 | `"Maximum 100 products per batch"` |

#### PATCH /products/batch

批量更新商品。**需要认证**。

**Request Body:**

```json
{
  "updates": [
    { "id": "...", "priceCents": 1500 },
    { "id": "...", "status": "archived" }
  ]
}
```

**Response (200):** 部分成功格式同上。

#### DELETE /products/batch

批量软删除商品。**需要认证**。

**Request Body:**

```json
{
  "ids": ["...", "...", "..."]
}
```

**Response (200):** 部分成功格式同上。

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R14-BR1 | 单个失败不影响其他 | 3 个商品中 1 个校验失败 → 其余 2 个成功创建 |
| R14-BR2 | 返回每个操作的结果 | results 数组长度等于输入长度 |
| R14-BR3 | index 正确对应输入位置 | results[i].index === i |
| R14-BR4 | summary 正确统计 | succeeded + failed === total |
| R14-BR5 | 权限检查逐个执行 | seller A 批量更新含 seller B 商品 → seller B 的那条失败 |
| R14-BR6 | 批量上限 100 | 提交 101 个返回 400 |
| R14-BR7 | 空数组返回错误 | products=[] 返回 400 |

### 约束与边界

- **部分成功模式**：HTTP 状态码为 200（即使部分操作失败），通过 `results` 数组报告每个操作的成败。
- **全部失败**：如果所有操作都失败，仍然返回 200，`summary.succeeded = 0`。
- **原子性**：每个商品的操作独立处理，不使用数据库事务包裹整个批量操作。
- **批量上限**：每次最多 100 个商品。
- **权限**：逐个检查权限。seller 只能操作自己的商品，admin 可操作所有商品。
- **审计日志**：每个成功的操作独立生成审计日志。

### 与已有功能的交互

- **Round 2**：复用商品创建/更新/删除逻辑。
- **Round 6**：批量创建商品时不自动创建库存记录。
- **Round 12**：每个成功操作生成独立审计日志。

---

## Round 15 — 商品变体（SKU）

### 需求描述

为商品添加变体（SKU）支持。例如一件 T 恤可以有不同的颜色和尺码，每个变体有独立的价格和库存。

### 数据模型

```typescript
interface ProductVariant {
  id: string;               // UUID v4
  productId: string;        // 父商品 ID
  tenantId: string;
  sku: string;              // SKU 编码，租户内唯一，1-50 字符
  name: string;             // 变体名称，如 "Red / Large"
  attributes: Record<string, string>; // 变体属性，如 { "color": "Red", "size": "L" }
  priceCents: number;       // 变体价格（分），可覆盖父商品价格
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

### API 端点

#### POST /products/:productId/variants

创建商品变体。**需要认证**，仅商品所有者和 `admin` 可操作。

**Request Body:**

```json
{
  "sku": "TSHIRT-RED-L",
  "name": "Red / Large",
  "attributes": { "color": "Red", "size": "L" },
  "priceCents": 2999,
  "status": "active"
}
```

**Response (201):** 返回 ProductVariant 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 商品不存在 | 404 | `"Product not found"` |
| 非商品所有者且非 admin | 403 | `"You can only manage variants for your own products"` |
| `sku` 缺失 | 400 | `"SKU is required"` |
| `sku` 已存在（租户内） | 409 | `"SKU already exists"` |
| `priceCents` ≤ 0 | 400 | `"Price must be a positive integer"` |
| `attributes` 为空对象 | 400 | `"At least one attribute is required"` |

#### GET /products/:productId/variants

获取商品的所有变体。**需要认证**。

**Response (200):** 返回 ProductVariant 数组。

#### PUT /products/:productId/variants/:variantId

更新变体信息。**需要认证**。

**Response (200):** 返回更新后的 ProductVariant 对象。

#### DELETE /products/:productId/variants/:variantId

软删除变体。**需要认证**。

**Response:** `204 No Content`

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R15-BR1 | SKU 在租户内唯一 | 创建重复 SKU 返回 409 |
| R15-BR2 | 变体有独立价格 | 变体价格可不同于父商品 |
| R15-BR3 | 变体有独立库存 | 每个变体有自己的 Inventory 记录 |
| R15-BR4 | 父商品删除时变体一起删除 | 删除商品后其变体也变为 deletedAt 非空 |
| R15-BR5 | 属性组合唯一 | 同一商品不可有两个相同属性组合的变体 |
| R15-BR6 | 购物车/订单引用变体 | 下单时可指定 variantId |

### 约束与边界

- **变体与库存**：每个变体有独立的 Inventory 记录。库存管理端点需扩展支持 `variantId`。
  - 新端点：`PUT /products/:productId/variants/:variantId/inventory`
  - 新端点：`GET /products/:productId/variants/:variantId/inventory`
- **购物车扩展**：CartItem 增加可选字段 `variantId`（string | null）。添加到购物车时，如果商品有变体则 **必须** 指定 `variantId`。
  - 错误：商品有变体但未指定 variantId → `422`，`error`: `"Product has variants. Please specify a variant"`.
- **属性组合唯一性**：同一商品下，`attributes` 的 key-value 组合不可重复。→ `409`，`error`: `"Variant with these attributes already exists"`.
- **最大变体数**：每个商品最多 50 个变体。→ `422`，`error`: `"Maximum 50 variants per product"`.

### 与已有功能的交互

- **Round 2**：扩展商品模型。
- **Round 3**：购物车支持变体引用。
- **Round 4**：订单支持变体引用，OrderItem 增加 `variantId` 和 `variantName`。
- **Round 6**：库存按变体独立管理。

---

## Round 16 — 评价系统

### 需求描述

实现商品评价功能。buyer 可以对已完成（delivered）的订单中的商品进行评价。支持评分和文字评价。

### 数据模型

```typescript
interface Review {
  id: string;               // UUID v4
  tenantId: string;
  productId: string;
  userId: string;           // 评价者
  orderId: string;          // 关联订单
  rating: number;           // 1-5 整数
  title: string;            // 评价标题，1-100 字符
  content: string;          // 评价内容，1-2000 字符
  isVerifiedPurchase: boolean; // 是否为已购买验证
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ProductRatingSummary {
  productId: string;
  averageRating: number;    // 保留一位小数
  totalReviews: number;
  ratingDistribution: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    "5": number;
  };
}
```

### API 端点

#### POST /products/:productId/reviews

创建评价。**需要认证**，仅 `buyer` 可操作。

**Request Body:**

```json
{
  "orderId": "...",
  "rating": 5,
  "title": "非常好",
  "content": "质量很好，物流很快。"
}
```

**Response (201):** 返回 Review 对象。`isVerifiedPurchase` 自动设为 `true`（因为必须关联已完成订单）。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 buyer 角色 | 403 | `"Only buyers can write reviews"` |
| 商品不存在 | 404 | `"Product not found"` |
| `orderId` 不存在 | 404 | `"Order not found"` |
| 订单状态不是 `delivered` | 422 | `"Can only review products from delivered orders"` |
| 订单中不含该商品 | 422 | `"Product not found in this order"` |
| 已对该订单中的该商品评价过 | 409 | `"You have already reviewed this product for this order"` |
| `rating` 不在 1-5 | 400 | `"Rating must be between 1 and 5"` |
| `title` 缺失或为空 | 400 | `"Review title is required"` |
| `content` 缺失或为空 | 400 | `"Review content is required"` |

#### GET /products/:productId/reviews

获取商品评价列表。**需要认证**。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 |
| `limit` | number | 每页条数 |
| `rating` | number | 按评分过滤 |
| `sortBy` | string | `createdAt`（默认）、`rating` |
| `sortOrder` | string | `asc` 或 `desc`（默认 `desc`） |

**Response (200):** 分页信封格式。

#### GET /products/:productId/ratings

获取商品评分汇总。**需要认证**。

**Response (200):**

```json
{
  "data": {
    "productId": "...",
    "averageRating": 4.3,
    "totalReviews": 28,
    "ratingDistribution": { "1": 1, "2": 2, "3": 3, "4": 10, "5": 12 }
  },
  "error": null
}
```

#### DELETE /products/:productId/reviews/:reviewId

软删除评价。**需要认证**。仅评价作者和 `admin` 可操作。

**Response:** `204 No Content`

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R16-BR1 | 仅 buyer 可评价 | seller 评价返回 403 |
| R16-BR2 | 仅已送达订单可评价 | paid 状态订单中商品评价返回 422 |
| R16-BR3 | 同一订单同一商品仅可评价一次 | 重复评价返回 409 |
| R16-BR4 | 评分汇总正确计算 | averageRating = sum(ratings) / count |
| R16-BR5 | 删除评价后汇总更新 | 删除一个 5 星评价后 averageRating 变化 |
| R16-BR6 | 评价按租户隔离 | 租户 A 的评价对租户 B 不可见 |

### 约束与边界

- **评价不可编辑**：一旦创建，不可修改（无 PUT/PATCH 端点）。只能删除后重新评价。
- **删除后可重新评价**：soft delete 后，同一 orderId + productId 组合可再次评价。
- **averageRating** 计算时排除已删除的评价。
- **ratingDistribution** 同样排除已删除的评价。

### 与已有功能的交互

- **Round 2**：评价关联商品。
- **Round 4**：评价关联订单，验证订单状态。
- **Round 8**：依赖订单状态机，仅 `delivered` 状态可评价。
- **Round 15**：有变体商品的评价关联到父商品（不区分变体）。

---

## Round 17 — 数据看板

### 需求描述

为 admin 提供业务数据看板 API。包含销售概览、商品统计和订单趋势。

### 数据模型

本轮无新增持久化数据模型。所有看板数据通过聚合查询现有 Order、Product、User 等实体实时计算，响应结构见各 API 端点。

### API 端点

#### GET /dashboard/overview

获取总览数据。**需要认证**，仅 `admin` 可操作。

**Response (200):**

```json
{
  "data": {
    "totalRevenueCents": 1500000,
    "totalOrders": 150,
    "totalProducts": 45,
    "totalUsers": 200,
    "averageOrderValueCents": 10000,
    "conversionRate": 3.5
  },
  "error": null
}
```

> `conversionRate` = 有订单的用户数 / 总用户数 × 100（百分比，保留一位小数）。

#### GET /dashboard/sales

获取销售趋势数据。**需要认证**，仅 `admin` 可操作。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `startDate` | string | 起始日期（ISO 8601，必填） |
| `endDate` | string | 结束日期（ISO 8601，必填） |
| `granularity` | string | `day`（默认）、`week`、`month` |

**Response (200):**

```json
{
  "data": {
    "dataPoints": [
      {
        "date": "2026-03-01",
        "revenueCents": 50000,
        "orderCount": 5,
        "averageOrderValueCents": 10000
      },
      {
        "date": "2026-03-02",
        "revenueCents": 75000,
        "orderCount": 8,
        "averageOrderValueCents": 9375
      }
    ],
    "summary": {
      "totalRevenueCents": 125000,
      "totalOrders": 13,
      "averageOrderValueCents": 9615
    }
  },
  "error": null
}
```

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin | 403 | `"Admin access required"` |
| `startDate` 缺失 | 400 | `"Start date is required"` |
| `endDate` 缺失 | 400 | `"End date is required"` |
| `startDate` > `endDate` | 400 | `"Start date must be before end date"` |
| 时间范围超过 1 年 | 400 | `"Date range must not exceed 1 year"` |
| `granularity` 不在枚举值中 | 400 | `"Granularity must be one of: day, week, month"` |

#### GET /dashboard/top-products

获取热门商品排行。**需要认证**，仅 `admin` 可操作。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `limit` | number | 返回数量（默认 10，最大 50） |
| `sortBy` | string | `revenue`（默认）、`quantity`、`orders` |

**Response (200):**

```json
{
  "data": {
    "products": [
      {
        "productId": "...",
        "productName": "...",
        "totalRevenueCents": 500000,
        "totalQuantitySold": 100,
        "totalOrders": 80
      }
    ]
  },
  "error": null
}
```

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R17-BR1 | 仅 admin 可访问看板 | seller/buyer 访问返回 403 |
| R17-BR2 | 数据按租户隔离 | 不同租户的看板数据独立 |
| R17-BR3 | totalRevenueCents 仅统计已完成的订单 | cancelled/refunded 订单不计入 |
| R17-BR4 | 取消订单不影响统计 | 取消订单后 totalOrders 减少 |
| R17-BR5 | 时间范围过滤正确 | 仅返回指定时间范围内的数据 |
| R17-BR6 | 排行排序正确 | revenue 排序时按 totalRevenueCents 降序 |

### 约束与边界

- **统计口径**：仅统计 `paid`、`shipped`、`delivered` 状态的订单。`cancelled` 和 `refunded` 不计入收入。
- **性能**：看板数据可以使用简单的聚合查询，不要求预计算或缓存。
- **时间范围**：最大查询范围 1 年。
- **conversionRate**：有至少一笔已完成订单的用户视为已转化。

### 与已有功能的交互

- **Round 4**：统计订单数据。
- **Round 5**：统计支付收入。
- **Round 8**：按订单状态过滤统计。

---

## Round 18 — 退款

### 需求描述

实现退款功能。支持对已支付（paid/shipped/delivered）的订单进行全额或部分退款。

### 数据模型

```typescript
interface Refund {
  id: string;              // UUID v4
  tenantId: string;
  orderId: string;
  paymentId: string;       // 原支付 ID
  amountCents: number;     // 退款金额（分）
  reason: string;          // 退款原因
  status: "pending" | "completed" | "failed";
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### API 端点

#### POST /orders/:orderId/refunds

发起退款。**需要认证**，仅 `admin` 可操作。

**Request Body:**

```json
{
  "amountCents": 5000,
  "reason": "商品质量问题"
}
```

**Response (201):** 返回 Refund 对象。

**模拟逻辑:** 退款立即完成（status: `"completed"`）。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin | 403 | `"Admin access required"` |
| 订单不存在 | 404 | `"Order not found"` |
| 订单状态不支持退款 | 422 | `"Order in '<status>' status cannot be refunded"` |
| 退款金额 ≤ 0 | 400 | `"Refund amount must be a positive integer"` |
| 退款金额超过可退金额 | 422 | `"Refund amount exceeds refundable amount"` |
| `reason` 缺失或为空 | 400 | `"Refund reason is required"` |

**可退金额计算:** `可退金额 = Order.totalCents - 已退款总额`。

#### GET /orders/:orderId/refunds

获取订单的退款记录。**需要认证**。

**Response (200):** 返回 Refund 数组。

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R18-BR1 | 仅 admin 可操作退款 | seller/buyer 发起退款返回 403 |
| R18-BR2 | 仅 paid/shipped/delivered 可退款 | pending_payment 订单退款返回 422 |
| R18-BR3 | 部分退款多次累计 | 退款 3000 + 退款 2000 = 已退 5000 |
| R18-BR4 | 累计退款不超过订单金额 | 已退 8000 后再退 5000（总额 10000）返回 422 |
| R18-BR5 | 全额退款后订单变为 refunded | totalCents 全部退完后 order.status 变为 "refunded" |
| R18-BR6 | 部分退款不改变订单状态 | 部分退款后 order.status 不变 |
| R18-BR7 | 退款回滚库存 | 全额退款后库存恢复 |

### 约束与边界

- **退款金额**：每次退款金额需为正整数，累计退款不超过 `Order.totalCents`。
- **部分退款**：允许多次部分退款，直到达到订单总金额。
- **全额退款**：当累计退款金额 = `Order.totalCents` 时，自动将订单状态更新为 `refunded`。
- **库存回滚**：全额退款时回滚库存。部分退款 **不** 回滚库存（因为无法确定退的是哪个商品）。
- **优惠券恢复**：全额退款时，如果订单使用了优惠券，`usedCount` 需 -1。
- **已取消订单**：`cancelled` 状态的订单不可退款（返回 422）。

### 与已有功能的交互

- **Round 5**：退款关联原支付记录。
- **Round 6**：全额退款时回滚库存。
- **Round 8**：全额退款时订单状态转为 `refunded`。
- **Round 10**：全额退款时恢复优惠券使用次数。
- **Round 12**：退款操作生成审计日志（`refund.created`）。

---

## Round 19 — 多币种

### 需求描述

支持多币种商品定价和订单结算。不同币种之间不可直接运算，需要通过汇率转换。

### 数据模型

```typescript
interface ExchangeRate {
  id: string;              // UUID v4
  tenantId: string;
  baseCurrency: string;    // ISO 4217，如 "USD"
  targetCurrency: string;  // ISO 4217，如 "EUR"
  rate: number;            // 汇率（浮点数），如 0.85
  effectiveAt: string;     // 生效时间
  createdAt: string;
}
```

### API 端点

#### GET /exchange-rates

获取当前汇率列表。**需要认证**。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `baseCurrency` | string | 基准货币（如 "USD"） |
| `targetCurrency` | string | 目标货币 |

**Response (200):**

```json
{
  "data": {
    "items": [
      {
        "id": "...",
        "baseCurrency": "USD",
        "targetCurrency": "EUR",
        "rate": 0.85,
        "effectiveAt": "..."
      }
    ]
  },
  "error": null
}
```

#### POST /exchange-rates

设置汇率。**需要认证**，仅 `admin` 可操作。

**Request Body:**

```json
{
  "baseCurrency": "USD",
  "targetCurrency": "EUR",
  "rate": 0.85
}
```

**Response (201):** 返回 ExchangeRate 对象。

**错误场景:**

| 条件 | 状态码 | error |
|------|--------|-------|
| 非 admin | 403 | `"Admin access required"` |
| `baseCurrency` 缺失 | 400 | `"Base currency is required"` |
| `targetCurrency` 缺失 | 400 | `"Target currency is required"` |
| `baseCurrency` == `targetCurrency` | 400 | `"Base and target currencies must be different"` |
| `rate` ≤ 0 | 400 | `"Exchange rate must be a positive number"` |
| 货币不在租户 allowedCurrencies 中 | 422 | `"Currency '<code>' is not allowed for this tenant"` |

#### GET /products/:id/prices

获取商品在所有支持币种下的价格。**需要认证**。

**Response (200):**

```json
{
  "data": {
    "productId": "...",
    "basePriceCents": 9999,
    "baseCurrency": "USD",
    "prices": [
      { "currency": "USD", "priceCents": 9999 },
      { "currency": "EUR", "priceCents": 8499 },
      { "currency": "CNY", "priceCents": 64993 }
    ]
  },
  "error": null
}
```

> 转换计算：`targetPriceCents = round(basePriceCents * rate)`。

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R19-BR1 | 不同币种不可直接相加 | 购物车中含 USD 和 EUR 商品 → 下单时需指定结算货币 |
| R19-BR2 | 汇率转换正确 | 100 USD * 0.85 = 85 EUR (8500 cents) |
| R19-BR3 | 仅支持租户允许的币种 | 租户仅允许 USD/EUR 时设置 CNY 汇率返回 422 |
| R19-BR4 | 订单记录结算货币 | Order 新增 settlementCurrency 字段 |
| R19-BR5 | 新汇率不影响已有订单 | 修改汇率后旧订单金额不变 |
| R19-BR6 | 汇率精度 | rate 支持最多 6 位小数 |

### 约束与边界

- **下单时指定结算货币**：`POST /orders` 新增可选字段 `settlementCurrency`。如果不指定，默认使用商品的 `currency`。
- **混合币种购物车**：如果购物车中商品来自不同 currency，下单时 **必须** 指定 `settlementCurrency`，否则返回 `422`，`error`: `"Cart contains multiple currencies. Please specify settlementCurrency"`.
- **汇率取最新**：转换时使用 `effectiveAt` 最晚且 ≤ 当前时间的汇率。
- **汇率不存在**：如果所需货币对无可用汇率 → `422`，`error`: `"No exchange rate available for <base> to <target>"`.
- **金额取整**：转换后的金额使用四舍五入（`Math.round`）。

### 与已有功能的交互

- **Round 2**：商品价格关联 currency 字段（已有）。
- **Round 3**：购物车可包含不同 currency 商品。
- **Round 4**：订单增加 `settlementCurrency` 字段。
- **Round 11**：租户配置 `allowedCurrencies` 限制可用币种。
- **Round 17**：看板统计按 `settlementCurrency` 聚合，或转换为租户默认货币。

---

## Round 20 — API v2 版本化

### 需求描述

引入 API v2，v1 和 v2 **共存**。v2 采用新的响应格式、新的分页方式和部分端点合并。v1 端点保持不变。

### 数据模型

本轮无新增持久化实体。v2 复用 v1 的底层数据存储，通过格式转换层适配新的响应结构（见下方 v2 变更内容）。

### v2 变更内容

#### 响应信封变更

v2 响应格式：

```json
{
  "success": true,
  "data": <T>,
  "meta": {
    "requestId": "...",
    "timestamp": "..."
  }
}
```

错误响应：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Product name is required",
    "details": [
      { "field": "name", "message": "is required" }
    ]
  },
  "meta": {
    "requestId": "...",
    "timestamp": "..."
  }
}
```

#### 分页变更

v2 使用 cursor-based 分页：

**请求参数：**
- `cursor`（string，可选）：起始游标
- `limit`（number，默认 20，最大 100）

**响应：**

```json
{
  "success": true,
  "data": {
    "items": [...],
    "nextCursor": "eyJpZCI6Ii4uLiJ9",
    "hasMore": true
  },
  "meta": { ... }
}
```

#### 错误码映射

| v1 error 字符串 | v2 error.code |
|------------------|---------------|
| `"...is required"` | `VALIDATION_ERROR` |
| `"...not found"` | `NOT_FOUND` |
| `"...already exists"` | `CONFLICT` |
| `"Authentication required"` | `UNAUTHORIZED` |
| `"Admin access required"` | `FORBIDDEN` |
| `"Insufficient inventory..."` | `BUSINESS_RULE_VIOLATION` |

### API 端点

所有 v1 端点在 `/api/v2` 路径前缀下提供对应版本，但使用 v2 的响应格式和分页方式。

#### GET /api/v2/products

v2 版商品列表（使用 cursor 分页）。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `cursor` | string | 分页游标 |
| `limit` | number | 每页条数 |
| `status` | string | 按状态过滤 |
| `search` | string | 搜索关键词（合并了 v1 的 /products/search） |
| `minPrice` | number | 最低价格 |
| `maxPrice` | number | 最高价格 |

> v2 将搜索功能合并到列表端点，不再有独立的 `/products/search` 端点。

#### GET /api/v2/orders

v2 版订单列表。新增 `include` 参数支持关联加载。

**查询参数:**

| 参数 | 类型 | 说明 |
|------|------|------|
| `cursor` | string | 分页游标 |
| `limit` | number | 每页条数 |
| `status` | string | 按状态过滤 |
| `include` | string | 逗号分隔的关联资源：`payments`、`refunds` |

**Response (200):** 订单列表，如 include=payments 则每个订单对象中内嵌 `payments` 数组。

### 业务规则

| 编号 | 规则 | 可测试条件 |
|------|------|-----------|
| R20-BR1 | v1 端点继续正常工作 | 所有 v1 端点返回格式不变 |
| R20-BR2 | v2 使用新响应格式 | v2 响应包含 success、meta 字段 |
| R20-BR3 | v2 使用 cursor 分页 | v2 列表响应包含 nextCursor、hasMore |
| R20-BR4 | v2 错误包含错误码 | v2 错误响应包含 error.code 字段 |
| R20-BR5 | v1 和 v2 共享底层数据 | v1 创建的商品在 v2 中可见，反之亦然 |
| R20-BR6 | v2 搜索合并到列表 | v2 GET /products?search=x 返回搜索结果 |
| R20-BR7 | v2 支持关联加载 | v2 GET /orders?include=payments 内嵌支付数据 |

### 约束与边界

- **v1 不变**：v1 的所有端点、请求格式、响应格式 **完全不变**。
- **共享数据层**：v1 和 v2 操作同一数据库，数据完全互通。
- **requestId**：每个 v2 请求生成唯一 UUID 作为 `meta.requestId`，用于追踪和调试。
- **cursor 编码**：cursor 使用 Base64 编码的 JSON 对象（如 `{"id":"...","createdAt":"..."}`），客户端无需解析。
- **v2 的认证和租户隔离**：与 v1 完全相同的机制。
- **v2 不包含的端点**：Webhook（`/webhooks/payments`）和认证端点（`/tenants`、`/auth/refresh`）在 v2 中保持与 v1 相同路径，不做版本化。

### 与已有功能的交互

- 所有已有 Round 的功能在 v2 端点中均可用。
- v2 端点需遵守 Round 7 的 RBAC 权限矩阵。
- v2 端点需记录 Round 12 的审计日志。
- v2 端点需触发 Round 13 的通知。

---

## 附录 A — 数据校验汇总

| 字段 | 类型 | 约束 | 所在实体 |
|------|------|------|----------|
| `id` | string | UUID v4 | 所有实体 |
| `name` (Tenant) | string | 1-100 字符 | Tenant |
| `slug` | string | 2-50 字符，[a-z0-9-]，全局唯一 | Tenant |
| `email` | string | 合法邮箱格式，租户内唯一 | User |
| `password` | string | ≥ 8 字符 | User（仅注册时） |
| `name` (User) | string | 1-100 字符 | User |
| `role` | string | admin \| seller \| buyer | User |
| `name` (Product) | string | 1-200 字符 | Product |
| `description` | string | 0-5000 字符 | Product |
| `priceCents` | number | 正整数（> 0） | Product, ProductVariant |
| `imageUrls` | string[] | 最多 10 个 | Product |
| `tags` | string[] | 每个 1-50 字符，最多 20 个 | Product |
| `quantity` (Cart) | number | 1-999 | CartItem |
| `quantity` (Inventory) | number | 非负整数 | Inventory |
| `rating` | number | 1-5 整数 | Review |
| `title` (Review) | string | 1-100 字符 | Review |
| `content` (Review) | string | 1-2000 字符 | Review |
| `code` (Coupon) | string | 1-50 字符，[A-Z0-9]，租户内唯一 | Coupon |
| `valuePercent` | number | 1-100 | Coupon |
| `sku` | string | 1-50 字符，租户内唯一 | ProductVariant |
| `rate` | number | 正数，最多 6 位小数 | ExchangeRate |
| `line1` | string | 1-200 字符 | Address |
| `city` | string | 1-100 字符 | Address |
| `state` | string | 1-100 字符 | Address |
| `postalCode` | string | 1-20 字符 | Address |
| `country` | string | ISO 3166-1 alpha-2 | Address |

---

## 附录 B — HTTP 状态码总览

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 | OK | GET 成功、PUT/PATCH 更新成功、批量操作（含部分失败） |
| 201 | Created | POST 创建资源成功 |
| 204 | No Content | DELETE 成功 |
| 400 | Bad Request | 请求参数校验失败（格式、类型、范围） |
| 401 | Unauthorized | 未认证、Token 无效/过期、Webhook 签名无效 |
| 403 | Forbidden | 权限不足（角色、所有权、租户不匹配） |
| 404 | Not Found | 资源不存在（含已软删除、跨租户） |
| 409 | Conflict | 唯一约束冲突（重复 slug/email/SKU/coupon code，重复评价，已支付） |
| 422 | Unprocessable Entity | 业务规则校验失败（状态不允许、库存不足、限额超过） |
| 429 | Too Many Requests | 请求频率限制 |
| 500 | Internal Server Error | 服务器内部错误 |

---

## 附录 C — 完整端点清单

### v1 端点（`/api/v1`）

| 方法 | 路径 | 认证 | 说明 | Round |
|------|------|------|------|-------|
| POST | /tenants | ❌ | 创建租户 | R1 |
| POST | /tenants/:tenantId/users/register | ❌ | 用户注册 | R1 |
| POST | /tenants/:tenantId/users/login | ❌ | 用户登录 | R1 |
| POST | /auth/refresh | ❌ | 刷新 Token | R1 |
| GET | /users/me | ✅ | 获取当前用户信息 | R1 |
| GET | /users | ✅ admin | 获取用户列表 | R7 |
| PATCH | /users/:id/role | ✅ admin | 修改用户角色 | R7 |
| POST | /products | ✅ seller/admin | 创建商品 | R2 |
| GET | /products | ✅ | 获取商品列表 | R2 |
| GET | /products/:id | ✅ | 获取商品详情 | R2 |
| PUT | /products/:id | ✅ owner/admin | 更新商品 | R2 |
| DELETE | /products/:id | ✅ owner/admin | 删除商品 | R2 |
| GET | /products/search | ✅ | 搜索商品 | R9 |
| GET | /products/:id/prices | ✅ | 获取多币种价格 | R19 |
| POST | /products/batch | ✅ seller/admin | 批量创建商品 | R14 |
| PATCH | /products/batch | ✅ seller/admin | 批量更新商品 | R14 |
| DELETE | /products/batch | ✅ seller/admin | 批量删除商品 | R14 |
| POST | /products/:id/variants | ✅ owner/admin | 创建变体 | R15 |
| GET | /products/:id/variants | ✅ | 获取变体列表 | R15 |
| PUT | /products/:id/variants/:variantId | ✅ owner/admin | 更新变体 | R15 |
| DELETE | /products/:id/variants/:variantId | ✅ owner/admin | 删除变体 | R15 |
| PUT | /products/:id/inventory | ✅ owner/admin | 设置库存 | R6 |
| GET | /products/:id/inventory | ✅ | 获取库存 | R6 |
| GET | /products/:id/inventory/logs | ✅ owner/admin | 获取库存日志 | R6 |
| PUT | /products/:id/variants/:variantId/inventory | ✅ owner/admin | 设置变体库存 | R15 |
| GET | /products/:id/variants/:variantId/inventory | ✅ | 获取变体库存 | R15 |
| POST | /products/:id/reviews | ✅ buyer | 创建评价 | R16 |
| GET | /products/:id/reviews | ✅ | 获取评价列表 | R16 |
| GET | /products/:id/ratings | ✅ | 获取评分汇总 | R16 |
| DELETE | /products/:id/reviews/:reviewId | ✅ author/admin | 删除评价 | R16 |
| GET | /cart | ✅ | 获取购物车 | R3 |
| POST | /cart/items | ✅ | 添加商品到购物车 | R3 |
| PATCH | /cart/items/:productId | ✅ | 修改购物车商品数量 | R3 |
| DELETE | /cart/items/:productId | ✅ | 移除购物车商品 | R3 |
| DELETE | /cart | ✅ | 清空购物车 | R3 |
| POST | /orders | ✅ | 创建订单 | R4 |
| GET | /orders | ✅ | 获取订单列表 | R4 |
| GET | /orders/:id | ✅ | 获取订单详情 | R4 |
| POST | /orders/:id/ship | ✅ seller/admin | 发货 | R8 |
| POST | /orders/:id/deliver | ✅ buyer/admin | 确认收货 | R8 |
| POST | /orders/:id/cancel | ✅ | 取消订单 | R8 |
| POST | /orders/:id/payments | ✅ owner | 发起支付 | R5 |
| GET | /orders/:id/payments | ✅ | 获取支付记录 | R5 |
| POST | /orders/:id/refunds | ✅ admin | 发起退款 | R18 |
| GET | /orders/:id/refunds | ✅ | 获取退款记录 | R18 |
| POST | /webhooks/payments | ❌ (签名) | 支付 Webhook | R5 |
| POST | /coupons | ✅ admin | 创建优惠券 | R10 |
| GET | /coupons | ✅ admin | 获取优惠券列表 | R10 |
| POST | /coupons/validate | ✅ | 验证优惠券 | R10 |
| GET | /tenant/config | ✅ admin | 获取租户配置 | R11 |
| PATCH | /tenant/config | ✅ admin | 更新租户配置 | R11 |
| GET | /audit-logs | ✅ admin | 获取审计日志 | R12 |
| GET | /notifications | ✅ | 获取通知列表 | R13 |
| PATCH | /notifications/:id/read | ✅ | 标记通知已读 | R13 |
| POST | /notifications/read-all | ✅ | 全部标记已读 | R13 |
| GET | /exchange-rates | ✅ | 获取汇率列表 | R19 |
| POST | /exchange-rates | ✅ admin | 设置汇率 | R19 |
| GET | /dashboard/overview | ✅ admin | 总览数据 | R17 |
| GET | /dashboard/sales | ✅ admin | 销售趋势 | R17 |
| GET | /dashboard/top-products | ✅ admin | 热门商品排行 | R17 |

### v2 端点（`/api/v2`）

| 方法 | 路径 | 说明 | Round |
|------|------|------|-------|
| GET | /products | 商品列表（合并搜索，cursor 分页） | R20 |
| GET | /products/:id | 商品详情 | R20 |
| POST | /products | 创建商品 | R20 |
| PUT | /products/:id | 更新商品 | R20 |
| DELETE | /products/:id | 删除商品 | R20 |
| GET | /orders | 订单列表（cursor 分页，支持 include） | R20 |
| GET | /orders/:id | 订单详情 | R20 |
| POST | /orders | 创建订单 | R20 |

> v2 端点共享 v1 的认证、租户隔离、RBAC 和审计日志机制。所有 v1 端点均有对应 v2 版本（此处仅列出有行为差异的端点）。
