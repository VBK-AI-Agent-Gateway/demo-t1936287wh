# 阶段⑤ API 文档

## 5.1 通用规范

| 项 | 约定 |
|---|---|
| Base URL | `https://{host}/api/v1` |
| 认证 | `Authorization: Bearer <access_token>`（JWT，含 tenant_id、uid、perms） |
| 租户标识 | JWT 内嵌 tenant_id；开放平台可加 `X-Tenant-Id`（需平台级 token 才可切换） |
| 幂等 | 写操作支持 `Idempotency-Key` 头（尤其审批/消息） |
| 分页 | `?page=1&page_size=20`，返回 `{"code":0,"msg":"ok","data":{...}}` |
| 错误码 | 0 成功；401 未认证；403 无权限/跨租户；409 冲突；429 限流；500 内部错误 |
| 时间 | ISO8601 UTC（2025-01-01T00:00:00Z） |

统一响应：
```json
{"code":0,"msg":"ok","data":{"items":[],"total":120}}
```

## 5.2 认证 `/auth`

| 方法 | 路径 | 说明 | 关键入参 | 关键出参 |
|---|---|---|---|---|
| POST | /auth/login | 账号密码登录 | tenant_domain, account, password | access_token, refresh_token, user |
| POST | /auth/sms-code | 短信验证码 | mobile | code_id |
| POST | /auth/login-sms | 短信登录 | mobile, code | 同上 |
| POST | /auth/refresh | 刷新令牌 | refresh_token | access_token |
| POST | /auth/logout | 退出 | — | — |
| GET  | /auth/me | 当前用户+权限点 | — | user, roles, perms[] |

## 5.3 通讯录 `/contacts`

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /departments/tree | contacts:read | 组织树（含成员数） |
| POST | /departments | contacts:write | 创建部门 |
| PUT | /departments/{id} | contacts:write | 改名/移动/设负责人 |
| DELETE | /departments/{id} | contacts:write | 删除（成员需先迁出） |
| GET | /users?dept_id=&kw= | contacts:read | 成员列表（data_scope 裁剪） |
| POST | /users | contacts:write | 创建成员 |
| PUT | /users/{id} | contacts:write | 修改 |
| POST | /users/{id}/disable | contacts:write | 停用/离职（可带 transfer_to） |
| POST | /contacts/import | contacts:import | Excel 批量导入（返回逐行结果） |
| GET | /users/{id}/profile | contacts:read | 个人资料（按隐私设置脱敏） |

## 5.4 IM `/im`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /conversations | 会话列表（含 last_msg、unread） |
| POST | /conversations | 创建会话 `{type:"single|group", peer_ids:[]}` |
| GET | /conversations/{id}/messages?before_seq= | 漫游消息（30 天） |
| POST | /conversations/{id}/messages | 发消息（幂等，client_msg_id） |
| POST | /messages/{id}/recall | 撤回（2 分钟内） |
| POST | /conversations/{id}/read | 标记已读 `up_to_seq` |
| POST | /conversations/{id}/members | 拉人/建群 |
| PUT | /conversations/{id}/settings | 群公告/禁言/管理 |
| WS | /ws/im?token= | 长连接：帧类型 auth/message/ack/ping/sync |

消息 body 示例：
```json
{"client_msg_id":"c-uuid","type":"text","content":"{\\\"text\\\":\\\"你好\\\"}","mention":[1001]}
```

## 5.5 OA 审批 `/oa`

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET/POST | /forms | oa:design | 表单模板 CRUD/发布（版本化） |
| GET/POST | /flows | oa:design | 流程定义（节点/条件 JSON） |
| GET | /instances/mine | oa:read | 我发起的 |
| GET | /tasks/todo | oa:approve | 我的待办 |
| POST | /instances | oa:submit | 发起 `{form_id, data:{...}}` |
| POST | /tasks/{id}/action | oa:approve | 同意/拒绝 `{action:"agree\|reject\|transfer", comment, to_user}` |
| POST | /instances/{id}/cc | oa:approve | 抄送 |
| GET | /instances/{id}/trace | oa:read | 流程轨迹（谁在何时做了什么） |
| GET | /stats/overview | oa:stats | 时长/通过率统计 |

## 5.6 考勤 `/attendance`

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET/POST | /shifts, /rules, /geos | att:config | 班次/规则/围栏配置 |
| POST | /punch | att:punch | 打卡 `{lng,lat,method,geo_id}` → 返回判定 |
| GET | /daily?month= | att:read | 个人日结果 |
| GET | /reports/monthly?dept= | att:export | 部门月报（导出 Excel） |
| POST | /corrections | att:approve | 补卡（内部走 OA） |
| GET/POST | /leaves/balance | att:read | 假期余额 |

## 5.7 云文档 `/docs`

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /spaces | doc:read | 空间列表 |
| GET | /files?space_id= | doc:read | 文件树 |
| POST | /files | doc:write | 新建文档/上传（multipart→MinIO） |
| GET/PUT | /files/{id}/content | doc:write | 读写（协同走 Yjs WebSocket） |
| POST | /files/{id}/permissions | doc:share | 授权 `{subject_type, subject_id, role}` |
| POST | /files/{id}/share-link | doc:share | 链接分享（密码/有效期） |
| GET | /files/{id}/versions | doc:read | 版本历史；POST …/rollback 回滚 |
| WS | /ws/docs/{id}?token= | — | Yjs 协同同步 |

## 5.8 工作台与开放 `/workbench`、`/open`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /workbench/layout | 当前用户生效布局（按角色/部门） |
| PUT | /workbench/layout | 管理员配置 widgets |
| GET | /todos | 待办聚合（审批/任务/日程 + 未读角标） |
| GET | /apps | 应用门户列表 |
| POST | /open/webhooks | 注册事件回调（message.created、task.approved…） |
| POST | /open/bots/messages | 自定义机器人推送群消息 |

## 5.9 权限与管理 `/admin`

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET/POST | /admin/roles | perm:role | 角色 CRUD（内置角色只读） |
| PUT | /admin/roles/{id}/perms | perm:role | 绑定权限点 |
| PUT | /admin/users/{id}/roles | perm:assign | 分配角色 + data_scope |
| GET | /admin/audit-logs?action=&from= | perm:audit | 审计检索 |
| GET/PUT | /admin/tenant/modules | tenant:setting | 模块开通/配额 |

## 5.10 开放平台（租户外）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /open/v1/token | app_id+app_secret 换 tenant 级 token |
| POST | /open/v1/messages | 应用向会话推消息 |
| GET  | /open/v1/users | 读通讯录（需 scope:contacts.read） |
| 回调 | POST {your_url} | 签名 `X-Signature: HMAC-SHA256(body, app_secret)` |

权限点命名规范：`{module}:{resource}:{action}`，如 `oa:approve`、`att:export`、`doc:share`。