# 阶段④ 系统架构

## 4.1 总体架构（SaaS / 私有化同构）

```
                    ┌──────────────────────────────────────────┐
   Web(PC)          │            客户端层                       │  iOS/Android
   cloudhub-web  ───┤  桌面端( Electron P1 )                    │──┐
                    └───────────────┬──────────────────────────┘   │
                                    │ HTTPS / WSS                  │
                    ┌───────────────▼──────────────────────────┐   │
                    │  接入层: Nginx / SLB  (TLS, 限流, 静态)    │   │
                    │  API Gateway (租户识别, JWT校验, 配额)      │   │
                    └───┬───────────┬───────────┬─────────────┘   │
                        │           │           │                 │
        ┌───────────────▼──┐ ┌──────▼───────┐ ┌─▼──────────────┐  │
        │ IM 服务(WebSocket)│ │ 业务微服务群  │ │ 开放平台/回调    │  │
        │ 连接网关+投递     │ │ org / oa /   │ │ webhook, H5 SDK │  │
        │ seq/ACK/漫游      │ │ att / doc /  │ └────────────────┘  │
        └────┬─────────────┘ │ workbench /  │                     │
             │               │ auth / audit │                    │
             │               └──────┬───────┘                    │
   ┌─────────▼────────┐   ┌─────────▼─────────┐  ┌──────────────▼┐
   │ Redis 集群        │   │  PostgreSQL 主从   │  │ MinIO/S3 对象  │
   │ 会话/在线/seq/    │   │  RLS 多租户隔离    │  │ 文件/附件      │
   │ 广播订阅          │   │  + 读写分离        │  └───────────────┘
   └──────────────────┘   └───────────────────┘
        Kafka(MQ): 消息投递、审计事件、考勤日结   │ Elasticsearch: 检索
```

## 4.2 技术栈选型

| 层 | 选型 | 理由 |
|---|---|---|
| 前端 Web | React 18 + TypeScript + Vite + Ant Design | 生态成熟、组件齐（表单设计器） |
| 移动端 | Flutter（或 uni-app 快速迭代） | 一套代码双端 |
| 后端框架 | Java 17 + Spring Boot 3 / 或 Go(gin)（二选一，推荐 Java 生态） | 流程引擎、审批生态（Flowable） |
| 流程引擎 | Flowable 7 | OA 审批省 60% 工作量 |
| 协同编辑 | yjs + Hocuspocus Server | CRDT 成熟、PG 存储 |
| IM 连接层 | Netty 自研网关（Go 版亦可） | 百万长连接 |
| 消息队列 | Kafka | 投递解耦、审计事件流 |
| 缓存 | Redis Cluster | 在线状态、序列号 |
| ORM | MyBatis-Plus + 多租户插件 | 自动注入 tenant_id |
| 搜索 | Elasticsearch 8 | 消息/文档检索 |
| 对象存储 | MinIO(私有化) / S3(SaaS) | 同接口 |
| 鉴权 | JWT(短) + Refresh Token；OIDC 对接 IdP | |
| 注册配置 | Nacos（私有化可降级为文件） | |
| 部署 | Docker + K8s(Helm) / Docker Compose 双轨 | 同镜像 |
| CI/CD | GitHub Actions → 镜像仓库 → Helm | |
| 可观测 | Prometheus + Grafana + Loki + OpenTelemetry | |

## 4.3 关键设计

### 4.3.1 IM 消息链路

| 步骤 | 动作 |
|---|---|
| 1 | 客户端 WSS 连接 → 网关鉴权(JWT 含 tenant_id/user_id) → 绑定连接 |
| 2 | 发送带 client_msg_id，网关分配全局 seq（Redis INCR per conv） |
| 3 | 落库 im_message（分区表）→ Kafka 投递事件 |
| 4 | 在线成员实时推送；离线写推送队列（FCM/厂商通道）+ 离线消息漫游 |
| 5 | ACK 回执；未 ACK 指数退避重发；client_msg_id 幂等去重 |

### 4.3.2 审批流程执行

| 步骤 | 动作 |
|---|---|
| 1 | 发起：表单校验 → Flowable 启动流程实例（含条件表达式上下文=表单数据） |
| 2 | 生成 oa_task → IM 卡片 + 工作台待办 |
| 3 | 审批动作写 oa_task + 流程推进；会签聚合节点等全部完成 |
| 4 | 终态回调：请假→att_leave；报销→oa_counter_budget；事件进 Kafka |
| 5 | 全程租户上下文透传，Flowable 任务表加 tenant_id |

### 4.3.3 权限判定链

```
请求 → Gateway(JWT 校验/租户提取/限流)
     → 业务服务 AOP @PreAuthorize(perm_code)
     → 数据层 MyBatis 租户拦截器 + data_scope(自动生成部门过滤)
     → PG RLS 兜底
     → audit_log 异步落 Kafka
```

### 4.3.4 SaaS 与私有化差异

| 维度 | SaaS | 私有化 |
|---|---|---|
| 镜像 | 同一套 K8s 镜像 | 同一套镜像 |
| 数据库 | 共享 PG + RLS（大客户可独立 schema/实例） | 独立 PG |
| 对象存储 | S3 | MinIO 内置 |
| 注册中心 | Nacos 集群 | compose 内置单节点/文件配置 |
| 计费/运营模块 | 开 | 关（模块开关 sys_tenant_module） |
| 升级 | 滚动无感升级 | 补丁包 + 回滚脚本 |
| 许可证 | 订阅 | License 文件校验节点数/到期 |

## 4.4 容量与高可用

| 项 | 设计 |
|---|---|
| IM 网关 | 无状态水平扩展，一致性哈希路由会话；单机 50 万长连接 |
| 消息扇出 | 群聊广播走网关本地订阅表 + Kafka 分区，避免 DB 轮询 |
| DB | 主从+流复制，PgBouncer 连接池，每租户连接打标 SET app.tenant_id |
| 降级开关 | 检索、统计、已读回执可独立降级 |
| 备份 | 每日全量 + WAL 归档，私有化提供灾备脚本 |

## 4.5 安全架构

| 项 | 措施 |
|---|---|
| 传输 | TLS1.2+，HSTS |
| 数据 | 手机号/证件号字段级 AES-GCM；文件 SSE-KMS 每租户 DEK |
| 认证 | 短信频率限制、密码 Argon2id、MFA(P1) |
| 授权 | 默认拒绝、最小权限；越权测试用例进 CI |
| 审计 | 登录/导出/权限变更/文档访问，180 天 |
| 合规 | 等保 2.0 三级适配清单（私有化交付包） |