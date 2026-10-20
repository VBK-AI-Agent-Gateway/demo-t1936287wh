# 阶段五：API 文档 —— Conflux 协同平台

## 1. 通用约定

| 项 | 约定 |
|---|---|
| Base URL | `https://{host}/api/v1`（平台级 `/api/platform/v1`） |
| 鉴权 | `Authorization: Bearer <JWT>`，JWT 内含 `uid`、`tenant_id`、`roles` |
| 租户识别 | JWT 优先，网关注入 `X-Tenant-Id` 到下游 |
| 幂等 | 写操作支持 `X-Idempotency-Key` |
| 分页 | `?page=1&page_size=20`，返回 `X-Total-Count` |
| 时间 | ISO8601 UTC / 秒级时间戳 |
| 版本 | URL 路径版本化，破坏性变更升 v2 |

### 1.1 统一响应体

```json
{ "code": 0, "message": "ok", "data": {}, "trace_id": "abc123" }
```

### 1.2 错误码表

| code | HTTP | 含义 |
|---|---|---|
| 0 | 200 | 成功 |
| 40001 | 400 | 参数校验失败 |
| 40101 | 401 | 未登录/token 过期 |
| 40301 | 403 | 无权限（含跨租户访问） |
| 40401 | 404 | 资源不存在 |
| 40901 | 409 | 冲突（重复单号等） |
| 42901 | 429 | 超出租户配额/限流 |
| 50000 | 500 | 系统错误 |

## 2. 认证与租户（iam）

| 方法 | 路径 | 说明 | 关键参数 |
|---|---|---|---|
| POST | /auth/sms-code | 发送验证码 | mobile |
| POST | /auth/login | 登录换 token | tenant_slug, mobile, code / password |
| POST | /auth/refresh | 刷新 token | refresh_token |
| POST | /auth/logout | 退出 | - |
| POST | /platform/tenants | 开通租户（平台） | name, slug, plan |
| GET | /platform/tenants/{id} | 租户详情（平台） | - |
| POST | /platform/tenants/{id}/status | 启停租户 | status |

## 3. 权限（perm）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /perm/roles | 角色列表 |
| POST | /perm/roles | 创建角色 {code,name,perm_ids[]} |
| PUT | /perm/roles/{id}/perms | 分配权限 |
| POST | /perm/users/{uid}/roles | 分配角色 |
| GET | /perm/my-permissions | 当前用户权限集合 |
| GET | /perm/data-scope?module=att | 查询数据权限 |
| GET | /perm/audit-logs | 审计日志（分页/过滤） |

## 4. 组织通讯录（org）

| 方法 | 路径 | 说明 | 关键参数 |
|---|---|---|---|
| GET | /departments/tree | 部门树 | with_member_count |
| POST | /departments | 创建部门 | parent_id, name |
| PUT | /departments/{id} | 更新部门 | name, leader_id, sort |
| DELETE | /departments/{id} | 删除部门 | id |
| GET | /users | 成员分页搜索 | keyword, dept_id, page |
| POST | /users | 创建成员 | name, mobile, dept_ids[] |
| PUT | /users/{id} | 更新成员 | 字段可选 |
| POST | /users/{id}/disable | 禁用成员 | - |
| POST | /users/import | Excel 批量导入 | file (multipart) |
| GET | /users/export | 导出 | dept_id |
| GET | /contacts/search | 通讯录搜索（受可见范围约束） | keyword |

## 5. IM（im）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /conversations | 会话列表（含最后一条消息、未读数） |
| POST | /conversations | 创建会话 {type, member_ids[]} |
| GET | /conversations/{id}/messages | 拉消息 `?before_seq=&limit=50` |
| POST | /conversations/{id}/messages | 发消息 {msg_type, body, client_msg_id} |
| POST | /messages/{id}/recall | 撤回（2分钟内） |
| POST | /conversations/{id}/read | 已读上报 {up_to_seq} |
| POST | /conversations/{id}/members | 拉人/建群 |
| WS | /ws/im?token= | 长连接 |

**WS 事件**：`message.new` / `message.recalled` / `read.updated` / `presence.updated` / `todo.push`

## 6. OA 审批（oa）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /forms | 模板列表 |
| POST | /forms | 创建/更新表单模板 {name, schema_json} |
| POST | /flows | 保存流程 {form_id, graph_json} |
| GET | /instances?status=&mine=apply|todo | 实例列表 |
| POST | /instances | 发起审批 {flow_id, form_data, biz_no} |
| GET | /instances/{id} | 详情（含流程图状态、任务轨迹） |
| POST | /instances/{id}/tasks/{taskId}/action | 处理 {action: approve|reject|transfer, comment} |
| POST | /instances/{id}/withdraw | 撤回 |
| POST | /instances/{id}/urge | 催办 |

## 7. 考勤（att）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | /groups | 考勤组 |
| PUT | /groups/{id}/members | 设置成员/排班 |
| POST | /punches | 打卡 {lat, lng, source, wifi_bssid} |
| GET | /punches?month=2025-01&user_id= | 月度明细 |
| GET | /report/monthly?month= | 月报（含迟到/加班） |
| GET | /leaves/balance | 假期余额 |
| POST | /leaves/balance/grant | 发放额度（管理员） |
| GET | /report/export?month= | Excel 导出 |

## 8. 云文档（doc）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /files?parent_id= | 列目录 |
| POST | /files | 新建 {parent_id, name, type} |
| POST | /files/upload | 上传（分片 init/part/complete） |
| GET | /files/{id}/download-url | 预签名下载 |
| POST | /files/{id}/permissions | 授权 {subject_type, subject_id, access} |
| POST | /files/{id}/share | 创建链接 {password, expire, allow_copy} |
| GET | /files/{id}/versions | 版本列表 |
| POST | /files/{id}/rollback | 回滚版本 |
| WS | /ws/doc/{fileId} | 协同编辑（Yjs sync/update） |

## 9. 工作台（ws）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /apps | 应用入口（按可见范围过滤） |
| POST | /apps | 管理员配置应用 |
| GET | /todos?status=0 | 待办列表（审批/@/公告聚合） |
| POST | /todos/{id}/done | 完成待办 |
| GET | /notices | 公告列表 |
| POST | /notices | 发布公告 {title, content, scope} |
| GET | /notices/{id}/read-stats | 已读统计 |
| GET | /dashboard/summary | 个人数据看板 |

## 10. 开放平台（open）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /open/oauth/token | Access Token（client_credentials） |
| GET | /open/users | 通讯录只读 API（需 scope） |
| POST | /open/messages/send | 应用发消息 |
| POST | /open/approvals/create | 代发起审批 |
| GET | /open/events?cursor= | 事件订阅回调拉取 |

**回调签名**：`X-Signature = HMAC-SHA256(body, app_secret)`，5 分钟时效。

## 11. 示例：发起审批

```http
POST /api/v1/oa/instances
Authorization: Bearer <JWT>
Content-Type: application/json
X-Idempotency-Key: 8f3a...

{
  "flow_id": 1001,
  "biz_no": "LV-2025-000123",
  "form_data": {
    "type": "annual", "start": "2025-02-10",
    "end": "2025-02-12", "days": 3, "reason": "回家探亲"
  }
}
```

```json
{ "code": 0, "message": "ok", "data": { "instance_id": 90001, "status": 1, "current_node": "leader_approve" } }
```

---
**阶段五确认点**：通用约定、错误码、9 组业务 API、开放平台、示例。确认后进入【阶段六：迭代计划】。