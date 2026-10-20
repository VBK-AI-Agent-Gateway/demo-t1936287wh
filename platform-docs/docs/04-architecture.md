# 阶段四：系统架构 —— Conflux 协同平台

## 1. 架构总览（分层）

| 层 | 组件 | 说明 |
|---|---|---|
| 客户端 | Web(PC) / iOS / Android / 桌面端 / 管理后台 | 统一 REST + WebSocket |
| 接入层 | Nginx / SLB + API Gateway | 鉴权、限流、路由、租户识别 |
| 服务层 | 8 个微服务（见下表） | 业务能力中心 |
| 消息层 | Kafka（或 RocketMQ 私有化） | 事件驱动、异步解耦 |
| 数据层 | MySQL8 / Redis / ES / MinIO | 按服务私有数据库（Database per Service） |
| 基础设施 | K8s + Helm / Docker Compose | SaaS 用 K8s，私有化支持单机 Compose |

## 2. 微服务清单

| 服务 | 职责 | 主存储 | 关键接口 |
|---|---|---|---|
| gateway | 统一鉴权、限流、租户上下文注入 | Redis(限流) | 全部入口 |
| iam-service | 账号、登录、租户、权限(RBAC) | MySQL | /auth, /perm |
| org-service | 组织通讯录 | MySQL | /departments, /users |
| im-service | 会话、消息、在线状态 | MySQL+Redis | /conversations, /messages, WS |
| oa-service | 表单、流程引擎、审批实例 | MySQL | /forms, /flows, /instances |
| att-service | 排班、打卡、假期 | MySQL | /groups, /punches, /balances |
| doc-service | 文件、权限、协同编辑协同服务 | MySQL+MinIO+ES | /files, /shares |
| ws-service | 工作台应用、公告、待办 | MySQL | /apps, /notices, /todos |
| notify-service | 站内信、IM 推送、邮件/短信 | Redis+MQ | 消费 MQ 事件 |

## 3. 关键机制

### 3.1 多租户请求链路（隔离硬性要求）

| 步骤 | 动作 |
|---|---|
| 1 | 域名/Header(X-Tenant) 或 JWT 中 tenant_id 解析租户 |
| 2 | gateway 校验订阅状态（停用租户直接 403） |
| 3 | 网关向下游透传 `X-Tenant-Id`，写入请求上下文 |
| 4 | 服务端 ORM 拦截器自动拼 `WHERE tenant_id=?`，缺失抛异常 |
| 5 | 缓存 key、MQ 消息、OSS 路径统一带租户前缀 |
| 6 | 兜底：审计中间件记录跨租户访问告警 |

### 3.2 IM 消息链路

| 步骤 | 动作 |
|---|---|
| 1 | 客户端 WS 连接 → gateway 鉴权 → 绑定连接注册表（Redis） |
| 2 | 发消息 → im-service 落库（seq 分配，会话级号段） → 发 Kafka |
| 3 | 在线推送（WS 直推） + 离线落离线表，登录后拉取 |
| 4 | 会话未读数 Redis 维护，已读回执更新 recv_seq |

### 3.3 审批流程引擎

| 步骤 | 动作 |
|---|---|
| 1 | 流程图 JSON（节点：审批人/会签/或签/条件/抄送） |
| 2 | 实例启动 → 按图推进状态机，生成 task 待办 |
| 3 | task 完成 → 条件路由下一节点 → 全通过写终态 |
| 4 | 事件发 MQ：扣假期（考勤）、写工作台待办、IM 提醒 |

### 3.4 权限校验

| 步骤 | 动作 |
|---|---|
| 1 | 登录签发 JWT（含 uid、tenant_id、roles、perm_version） |
| 2 | 网关验签；服务内 `@RequirePerm("org:user:create")` 切面校验 |
| 3 | 数据权限：按 pm_data_scope 注入行过滤 |
| 4 | 权限变更 → bump perm_version → 客户端刷新 token |

## 4. 技术选型

| 领域 | 选型 | 理由 |
|---|---|---|
| 后端语言 | Java 17 + Spring Boot 3（或 Go 混合） | 生态成熟、企业级 |
| 框架 | Spring Cloud Gateway / Nacos | 微服务治理 |
| ORM | MyBatis-Plus + 租户拦截器插件 | 行级隔离开箱即用 |
| 前端 | Vue3 + TypeScript + Element Plus | 中后台效率 |
| IM 前端 | WebSocket + 心跳重连 | 长连接 |
| 搜索 | Elasticsearch 8 | 通讯录/文档全文检索 |
| 对象存储 | MinIO（私有化）/ OSS（SaaS） | 兼容 S3 |
| 协同编辑 | y-websocket + Yjs | CRDT |
| 可观测 | Prometheus + Grafana + SkyWalking | 租户维度 metrics |
| CI/CD | GitLab CI / GitHub Actions + Helm | 双形态交付 |

## 5. 部署形态

| 形态 | 方案 | 规模 |
|---|---|---|
| SaaS | K8s 多副本、MySQL 主从、Redis 集群、ES 3节点 | 数百租户 |
| 专属云 | 独立 K8s 命名空间 + 独立库 | 单客户 |
| 私有化（标准） | Helm Chart，全部组件容器化 | ≤5000人 |
| 私有化（轻量） | docker-compose 单机（MySQL/Redis/MinIO/后端/前端） | ≤200人 |

## 6. 安全设计

| 项 | 措施 |
|---|---|
| 传输 | 全站 TLS1.2+，HSTS |
| 存储 | 手机号/证件 AES-256-GCM，密钥 KMS/租户主密钥 |
| 鉴权 | JWT + Refresh Token，15min/7d |
| 越权 | 租户拦截器 + 自动化越权测试用例（CI 必跑） |
| 审计 | 登录/导出/改权全量日志，90 天可查 |
| 依赖 | SCA 扫描、镜像签名 |

## 7. 容量与扩展性

| 指标 | 目标 | 手段 |
|---|---|---|
| 租户数 | 1000+ | 行级隔离 + 按 plan 分库（大租户迁独立库） |
| IM 在线 | 10w/集群 | 网关水平扩、会话分片 |
| 消息存储 | 月增 10 亿条 | 按月分区 + 冷归档 |
| API P99 | ≤300ms | 缓存、索引、异步化 |

---
**阶段四确认点**：分层架构、8 微服务、租户链路/IM/审批/权限四大机制、双形态部署。确认后进入【阶段五：API 文档】。