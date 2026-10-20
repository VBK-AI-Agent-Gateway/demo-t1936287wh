# 阶段三：数据库设计 —— Conflux 协同平台

## 1. 多租户隔离策略（硬性要求）

| 层级 | 方案 | 适用 | 说明 |
|---|---|---|---|
| 必选 | **行级隔离**：所有业务表带 `tenant_id`，ORM 强制 WHERE | 全部租户 | 连接级上下文注入，缺失直接拒绝 |
| 可选（大客户） | Schema 隔离：每租户一个 schema | 旗舰/私有化 | 租户级连接池路由 |
| 可选（超大/合规） | 独立库/独立实例 | 私有化 | 路由表 `tenant_id -> dsn` |
| 缓存 | key 统一前缀 `t:{tenant_id}:*` | 全部 | 禁止跨前缀 SCAN |
| 消息队列 | topic 带租户后缀或消息体携带 tenant_id | 全部 | 消费端二次校验 |
| 文件存储 | OSS 路径 `/{tenant_id}/...` | 全部 | 预签名 URL 短时效 |

**强制约定**：任何业务表必须含 `tenant_id`（除平台级表 `platform_*`）；CI 静态检查 + 慢查询审计兜底。

## 2. 库选型

| 用途 | 存储 |
|---|---|
| 核心业务 | MySQL 8（InnoDB） |
| IM 消息/会话 | MySQL（冷）+ Redis（热，7天） |
| 缓存/在线状态 | Redis Cluster |
| 文档/文件 | S3 兼容对象存储（MinIO 私有化） |
| 检索 | Elasticsearch |
| 图关系（组织/群） | MySQL 递归 CTE（v1 不引入图库） |

## 3. ER 总览

| 域 | 主要实体 |
|---|---|
| 平台 | platform_tenant, platform_subscription, platform_audit_log |
| 组织 | org_department, org_user, org_user_dept, org_position |
| IM | im_conversation, im_conversation_member, im_message, im_friend |
| OA | oa_form, oa_form_field, oa_flow, oa_flow_node, oa_instance, oa_instance_task, oa_cc |
| 考勤 | atd_group, atd_shift, atd_schedule, atd_punch, atd_leave_balance, atd_leave_record |
| 文档 | doc_file, doc_permission, doc_version, doc_share |
| 工作台 | ws_app, ws_app_scope, ws_notice, ws_notice_read, ws_todo |
| 权限 | pm_role, pm_permission, pm_role_perm, pm_user_role, pm_data_scope, pm_api_key |

## 4. 核心表设计（DDL 摘要）

### 4.1 平台级（无 tenant_id）

```sql
CREATE TABLE platform_tenant (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(64)  NOT NULL,           -- 企业名
  slug          VARCHAR(32)  NOT NULL UNIQUE,    -- 子域/标识
  status        TINYINT NOT NULL DEFAULT 1,      -- 1正常 0停用 2试用
  plan          VARCHAR(16) NOT NULL DEFAULT 'free', -- free/pro/ultimate/private
  quota_user    INT NOT NULL DEFAULT 50,
  quota_storage BIGINT NOT NULL DEFAULT 10737418240, -- 10GB
  schema_name   VARCHAR(64) NULL,                -- 可选 schema 隔离
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status (status)
);

CREATE TABLE platform_subscription (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  plan VARCHAR(16) NOT NULL,
  start_at DATETIME NOT NULL, end_at DATETIME NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  KEY idx_tenant (tenant_id)
);
```

### 4.2 组织通讯录

```sql
CREATE TABLE org_department (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  parent_id BIGINT NOT NULL DEFAULT 0,
  name VARCHAR(64) NOT NULL,
  path VARCHAR(512) NOT NULL,          -- 物化路径 /1/5/
  leader_id BIGINT NULL,
  sort INT NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 1,
  KEY idx_tenant_parent (tenant_id, parent_id),
  KEY idx_tenant_path (tenant_id, path)
);

CREATE TABLE org_user (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  union_id VARCHAR(64) NOT NULL,        -- 租户内唯一
  name VARCHAR(64) NOT NULL,
  mobile_enc VARBINARY(256) NOT NULL,   -- AES 加密存储
  mobile_hash CHAR(64) NOT NULL,        -- 查询索引用 SHA256
  email VARCHAR(128) NULL,
  position_id BIGINT NULL,
  status TINYINT NOT NULL DEFAULT 1,     -- 1在职 0禁用 2离职
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tenant_union (tenant_id, union_id),
  UNIQUE KEY uk_tenant_mhash (tenant_id, mobile_hash),
  KEY idx_tenant_status (tenant_id, status)
);

CREATE TABLE org_user_dept (
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  dept_id BIGINT NOT NULL,
  is_primary TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, user_id, dept_id)
);
```

### 4.3 IM

```sql
CREATE TABLE im_conversation (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  type TINYINT NOT NULL,               -- 1单聊 2群聊
  owner_id BIGINT NULL,
  title VARCHAR(128) NULL,
  last_msg_id BIGINT NULL,
  last_at DATETIME NULL,
  member_count INT NOT NULL DEFAULT 2,
  KEY idx_tenant_type (tenant_id, type)
);

CREATE TABLE im_conversation_member (
  tenant_id BIGINT NOT NULL,
  conv_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  mute TINYINT NOT NULL DEFAULT 0,
  recv_seq BIGINT NOT NULL DEFAULT 0,   -- 个人已读位点
  join_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, conv_id, user_id),
  KEY idx_tenant_user (tenant_id, user_id, recv_seq)
);

CREATE TABLE im_message (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  conv_id BIGINT NOT NULL,
  seq BIGINT NOT NULL,                  -- 会话内递增序号
  sender_id BIGINT NOT NULL,
  msg_type TINYINT NOT NULL,            -- 1文本2图片3文件4系统...
  body JSON NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,    -- 1正常 2撤回
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_conv_seq (tenant_id, conv_id, seq),
  KEY idx_tenant_conv_time (tenant_id, conv_id, created_at)
);
```

### 4.4 OA 审批

```sql
CREATE TABLE oa_form (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  schema_json JSON NOT NULL,           -- 表单控件定义
  status TINYINT NOT NULL DEFAULT 1,
  KEY idx_tenant (tenant_id, status)
);

CREATE TABLE oa_flow (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  form_id BIGINT NOT NULL,
  graph_json JSON NOT NULL,            -- 节点/连线/条件
  version INT NOT NULL DEFAULT 1,
  KEY idx_tenant_form (tenant_id, form_id)
);

CREATE TABLE oa_instance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  flow_id BIGINT NOT NULL,
  flow_version INT NOT NULL,
  biz_no VARCHAR(64) NOT NULL,          -- 业务单号，幂等
  applicant_id BIGINT NOT NULL,
  form_data JSON NOT NULL,
  status TINYINT NOT NULL,              -- 1进行中 2同意 3驳回 4撤回 5作废
  current_node VARCHAR(64) NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  UNIQUE KEY uk_tenant_biz (tenant_id, biz_no),
  KEY idx_tenant_applicant (tenant_id, applicant_id, status)
);

CREATE TABLE oa_instance_task (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  instance_id BIGINT NOT NULL,
  node_key VARCHAR(64) NOT NULL,
  approver_id BIGINT NOT NULL,
  action TINYINT NULL,                  -- NULL待办 1同意 2驳回 3转交
  action_at DATETIME NULL,
  comment VARCHAR(512) NULL,
  KEY idx_tenant_approver (tenant_id, approver_id, action),
  KEY idx_tenant_instance (tenant_id, instance_id)
);
```

### 4.5 考勤

```sql
CREATE TABLE atd_group (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  rule_json JSON NOT NULL,              -- 班次/容差/围栏
  KEY idx_tenant (tenant_id)
);

CREATE TABLE atd_punch (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  punch_at DATETIME NOT NULL,
  punch_type TINYINT NOT NULL,          -- 1上班 2下班
  geo POINT NULL,
  result TINYINT NOT NULL,              -- 1正常 2迟到 3早退 4缺卡 5异常
  source TINYINT NOT NULL,               -- 1APP 2WiFi 3补卡
  KEY idx_tenant_user_date (tenant_id, user_id, work_date)
);

CREATE TABLE atd_leave_balance (
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  leave_type VARCHAR(32) NOT NULL,
  total DECIMAL(6,2) NOT NULL DEFAULT 0,
  used DECIMAL(6,2) NOT NULL DEFAULT 0,
  year INT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, leave_type, year)
);
```

### 4.6 云文档

```sql
CREATE TABLE doc_file (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  parent_id BIGINT NOT NULL DEFAULT 0,
  name VARCHAR(255) NOT NULL,
  type TINYINT NOT NULL,                -- 1文件夹 2文档 3表格 4附件
  storage_key VARCHAR(512) NULL,        -- OSS 路径 /{tenant}/...
  size BIGINT NOT NULL DEFAULT 0,
  owner_id BIGINT NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  KEY idx_tenant_parent (tenant_id, parent_id)
);

CREATE TABLE doc_permission (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  file_id BIGINT NOT NULL,
  subject_type TINYINT NOT NULL,        -- 1用户 2部门 3链接
  subject_id BIGINT NOT NULL,
  access TINYINT NOT NULL,              -- 1可看 2可编辑 0禁止
  KEY idx_tenant_file (tenant_id, file_id)
);
```

### 4.7 工作台

```sql
CREATE TABLE ws_app (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(64) NOT NULL,
  icon VARCHAR(512) NULL,
  entry_url VARCHAR(512) NULL,
  sort INT NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 1,
  KEY idx_tenant (tenant_id, status, sort)
);

CREATE TABLE ws_notice (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  title VARCHAR(128) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  publisher_id BIGINT NOT NULL,
  scope_json JSON NOT NULL,             -- 可见范围
  read_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tenant_time (tenant_id, created_at)
);

CREATE TABLE ws_todo (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  todo_type VARCHAR(32) NOT NULL,       -- approve/mention/notice
  ref_id BIGINT NOT NULL,
  title VARCHAR(128) NOT NULL,
  status TINYINT NOT NULL DEFAULT 0,    -- 0未处理 1已处理
  deadline DATETIME NULL,
  KEY idx_tenant_user (tenant_id, user_id, status, deadline)
);
```

### 4.8 权限系统

```sql
CREATE TABLE pm_role (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(64) NOT NULL,
  type TINYINT NOT NULL,                -- 1内置 2自定义
  UNIQUE KEY uk_tenant_code (tenant_id, code)
);

CREATE TABLE pm_permission (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(128) NOT NULL UNIQUE,    -- 如 org:user:create（平台级字典）
  name VARCHAR(64) NOT NULL,
  module VARCHAR(32) NOT NULL
);

CREATE TABLE pm_role_perm (
  tenant_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  perm_id BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, role_id, perm_id)
);

CREATE TABLE pm_user_role (
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, role_id)
);

CREATE TABLE pm_data_scope (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  module VARCHAR(32) NOT NULL,
  scope_type TINYINT NOT NULL,          -- 1本人 2本部门 3全公司 4自定义
  dept_ids JSON NULL,
  UNIQUE KEY uk_tenant_role_module (tenant_id, role_id, module)
);
```

## 5. 索引与规范要点

| 规范 | 要求 |
|---|---|
| 主键 | BIGINT 自增（业务侧对外用雪花ID） |
| 租户索引 | 每个唯一/查询索引首列必须含 tenant_id |
| 软删除 | status/tinyint，禁止物理删核心数据 |
| 加密 | 手机号/身份证 AES 加密 + SHA256 索引列 |
| 分区 | im_message、atd_punch 按月 RANGE 分区 |
| 归档 | 消息/打卡 12 个月后转历史库 |

---
**阶段三确认点**：多租户隔离策略、8 组核心 DDL、索引规范。确认后进入【阶段四：系统架构】。