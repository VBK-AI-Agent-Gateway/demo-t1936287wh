# 阶段③ 数据库设计

## 3.1 数据库选型

| 组件 | 选型 | 用途 |
|---|---|---|
| 主库 | PostgreSQL 15+ | 组织/审批/考勤/权限等事务数据（强一致） |
| 缓存 | Redis 7 | 会话、在线状态、消息 seq、验证码 |
| 搜索 | Elasticsearch（可选，私有化可降级 Lucene） | 消息/文档全文检索 |
| 对象存储 | S3 / MinIO | 文件、图片、文档附件 |
| 图/关系库（P2） | Neo4j 或 PG recursive CTE | 组织树、审批链路查询 |

## 3.2 多租户隔离策略（硬性要求）

| 层级 | 手段 | 说明 |
|---|---|---|
| L1 应用层 | 所有表强制 `tenant_id NOT NULL`，MyBatis/JPA 拦截器自动注入 WHERE tenant_id=? | 应用代码禁止手写无租户条件的查询 |
| L2 ORM 层 | 租户插件 + 单测：任何查询缺 tenant_id 直接抛异常 | CI 卡点 |
| L3 数据库层 | RLS（Row Level Security）：`ALTER TABLE t ENABLE ROW LEVEL FORCE`，会话变量 `SET app.tenant_id` | 即便应用有 bug 也无法跨租户读 |
| L4 大客户隔离 | Schema-per-Enterprise：私有化独立库；SaaS 超大租户可迁独立 schema | 弹性策略 |
| L5 密钥隔离 | 每租户独立数据密钥 DEK，KMS 包裹存储 | 文件/敏感字段加密 |
| L6 会话隔离 | JWT 声明 tenant_id，Redis key 前缀 `t:{tenant_id}:` | 缓存不串号 |

RLS 示例：
```sql
ALTER TABLE im_message ENABLE FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON im_message
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- 业务连接池初始化: SET app.tenant_id = '<tid>';
```

## 3.3 核心实体 ER 概览

```
tenant(租户) 1─┬─* org_department 1─* org_user（成员）
              ├─* im_conversation 1─* im_message
              ├─* oa_definition 1─* oa_instance 1─* oa_task
              ├─* att_rule 1─* att_record
              ├─* doc_space 1─* doc_file 1─* doc_permission
              └─* sys_role 1─* sys_role_perm
```

## 3.4 表清单（按模块）

### 通用 / 租户

| 表名 | 关键字段 | 说明 |
|---|---|---|
| sys_tenant | id, name, plan, status, domain, created_at, dek_encrypted | 租户主表；plan 决定模块开通 |
| sys_tenant_module | tenant_id, module_code, enabled, expire_at | 模块开关与配额 |
| sys_audit_log | tenant_id, actor_id, action, target, ip, created_at | 审计，180 天归档 |
| sys_region | tenant_id, code, parent_id, name | 行政区/自定义区域（考勤围栏、通讯录扩展） |

### M1 组织通讯录

| 表名 | 关键字段 | 说明 |
|---|---|---|
| org_department | tenant_id, id, parent_id, name, leader_id, path, sort | path 物化路径加速子树查询 |
| org_user | tenant_id, id, emp_no, name, mobile_enc, email, dept_id, status, joined_at | 手机号加密存储；uk(tenant_id, emp_no) |
| org_user_ext | tenant_id, user_id, k, v | 扩展属性 JSONB |
| org_user_status_log | tenant_id, user_id, from, to, reason | 入转调离留痕 |

### M2 IM

| 表名 | 关键字段 | 说明 |
|---|---|---|
| im_conversation | tenant_id, id, type(single/group), owner_id, last_seq, member_count | 会话头 |
| im_conv_member | tenant_id, conv_id, user_id, mute, recv_level, last_read_seq | 成员与已读位点 |
| im_message | tenant_id, conv_id, seq, sender_id, type, body(jsonb), created_at | uk(tenant_id, conv_id, seq)；分区表按月 |
| im_friend | tenant_id, user_id, friend_id, remark | 单向关系表，双向行 |

### M3 OA 审批

| 表名 | 关键字段 | 说明 |
|---|---|---|
| oa_form_def | tenant_id, id, name, version, schema(jsonb), status | 表单定义（版本化） |
| oa_flow_def | tenant_id, form_id, graph(jsonb), current_ver | 流程图：节点+条件表达式 |
| oa_instance | tenant_id, id, def_ver, form_data(jsonb), status, initiator, current_node | 实例主表 |
| oa_task | tenant_id, instance_id, node_id, approver_id, action, comment, acted_at | 节点任务（同意/拒绝/转交） |
| oa_cc | tenant_id, instance_id, user_id, read_at | 抄送 |
| oa_counter_budget | tenant_id, subject, amount_sum | 报销等聚合 |

### M4 考勤

| 表名 | 关键字段 | 说明 |
|---|---|---|
| att_group | tenant_id, id, name, members(jsonb) | 考勤组 |
| att_shift | tenant_id, id, name, periods(jsonb), span | 班次（弹性/综合工时参数） |
| att_rule | tenant_id, shift_id, workdays, late_min, geo_ids | 判定规则 |
| att_geo | tenant_id, name, lng, lat, radius | 围栏 |
| att_punch | tenant_id, user_id, date, time, method, lng, lat, result | 打卡原始记录 |
| att_daily | tenant_id, user_id, date, status, work_min, late_min, exceptions(jsonb) | 日结结果 |
| att_leave | tenant_id, user_id, type, start, end, hours, instance_id | 假期流水（关 OA 实例） |

### M5 云文档

| 表名 | 关键字段 | 说明 |
|---|---|---|
| doc_space | tenant_id, id, name, type(personal/team/wiki) | 空间 |
| doc_file | tenant_id, space_id, parent_id, name, type, owner_id, version, trashed | 文件树 |
| doc_permission | tenant_id, file_id, subject_type(user/link), subject_id, role(view/comment/edit) | 权限 |
| doc_snapshot | tenant_id, file_id, version, state(bytes/CRDT), created_at | 版本快照 |
| doc_comment | tenant_id, file_id, anchor, user_id, body, status | 评论 |

### M6 工作台 / M7 权限

| 表名 | 关键字段 | 说明 |
|---|---|---|
| app_application | tenant_id, id, name, icon, url, group, sort | 应用门户 |
| workbench_layout | tenant_id, scope(dept/role/all), scope_id, widgets(jsonb) | 工作台布局 |
| sys_role | tenant_id, id, name, builtin | 角色 |
| sys_role_perm | role_id, perm_code | 权限点（perm_code 如 `oa:approve`、`att:export`） |
| sys_user_role | tenant_id, user_id, role_id, data_scope(self/dept/all) | 用户-角色-数据范围 |

## 3.5 关键索引与约束（节选）

| 表 | 索引/约束 | 目的 |
|---|---|---|
| im_message | uk(tenant_id, conv_id, seq); idx(conv_id, created_at DESC) | 消息去重+漫游翻页 |
| org_user | uk(tenant_id, emp_no); idx(tenant_id, dept_id) | 唯一性+按部门查 |
| oa_instance | idx(tenant_id, initiator, created_at); idx(status) | 我发起的/待办 |
| att_daily | uk(tenant_id, user_id, date) | 日结幂等 |
| im_conv_member | uk(conv_id, user_id); idx(user_id, mute) | 会话列表 |
| 全表 | tenant_id 作为所有 uk/index 首列 | 隔离裁剪+分区裁剪 |

## 3.6 分库分表与归档

| 场景 | 策略 |
|---|---|
| im_message 增长 | PG 声明式分区，按 (tenant_id hash) 子分区 + 按月时间分区 |
| 私有化超大租户 | 消息库独立实例 |
| 审计/消息归档 | 冷数据转对象存储 Parquet，保留 1 年在线 |