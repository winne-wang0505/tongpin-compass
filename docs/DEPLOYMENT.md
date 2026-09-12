# 部署与恢复

当前尚未部署，以下为单台 Linux 主机部署步骤。公开发布、主机费用、域名和邮箱服务需要用户授权，仓库不包含虚构线上地址。

## 最简路径：Render Blueprint

仓库根目录已经提供 `render.yaml`。将项目推送到私有 GitHub 仓库后，在 Render 选择 New Blueprint 并连接该仓库。Blueprint 会创建单个付费 Node Web Service 和 `/var/data` 持久磁盘；免费 Web Service 没有持久磁盘，不能保存真实账号和报告。

首次创建时，Render 会要求填写标记为 `sync: false` 的变量：`APP_ORIGIN` 填完整的 HTTPS 服务地址，其他项目填写真实 SMTP、运营主体、联系邮箱和部署地区。`BETTER_AUTH_SECRET` 由 Render 自动随机生成。默认 `AI_MODE=disabled`，不需要模型密钥，确定性匹配仍可完整使用。

Render 服务生成后，如果实际 `onrender.com` 地址和最初填写的 `APP_ORIGIN` 不同，先修正该变量再让用户注册。绑定自定义域名后也要将 `APP_ORIGIN` 改为最终域名并重新部署。

## 生产前置条件

1. 取得一台具有持久磁盘的主机、域名，安装 Node 24.19+ 与固定 pnpm。
2. 配置 HTTPS 反向代理（例如 Caddy/Nginx）；应用端口仅允许代理访问。
3. 在主机的 secret/environment 管理入口填写 .env.example 对应变量，绝不把密钥发到聊天或写入源码。
4. 设置 APP_MODE=production、APP_ORIGIN=https://实际域名；提供随机认证密钥、SMTP、真实运营信息。真实 AI 可选，但启用 live 必须填写服务方名称和隐私政策并披露数据使用。
5. 审核页面隐私说明、使用条款、模型服务地区及数据保留政策。未完成这些事项不能把草案当成已完成合规。

## 发布

将源码部署到独立 release 目录；data 放到持久路径，例如 /var/lib/compass。配置文件由服务管理器管理，权限仅服务账号可读。不要复制开发 .env、测试数据库或 demo-accounts.json。

```sh
pnpm install --frozen-lockfile
pnpm build
# 通过进程管理器加载完整生产环境
pnpm migrate:production
pnpm start
```

反向代理配置需求：HTTPS自动续期、转发到本机3000、请求体上限32KB（包括认证接口）、请求超时至少35秒、登录/恢复路由限流、禁止缓存 /api、避免记录查询参数/请求体/Cookie。邀请令牌使用 fragment，重置密码链接仍为短期秘密，不应记录完整 URL。禁止应用端口直接对公网开放。

服务进程：专用低权限账号、WorkingDirectory 指向 release、EnvironmentFile 指向受保护配置、ExecStart 使用 node dist-server/server/index.js、Restart=on-failure。单实例，不开 cluster 模式。SQLite 数据路径必须能写入且不可放在公开静态目录。

## 健康与监测

GET /api/health 返回 {status:ok} 并访问数据库。监测进程存活、5xx计数、磁盘剩余空间、备份年龄、SMTP错误。服务日志仅记录事件种类，不应添加资料正文、邮箱、Cookie或模型内容。避免上报完整请求到第三方监控。

启动后检查：HTTPS、Secure/HttpOnly/SameSite Cookie、未登录拒绝访问、真实邮件验证与恢复、双账号完整流程、第三账号权限、授权撤回、AI实际请求（若启用）。这些线上检查当前未执行。

## 一致备份

```sh
pnpm backup
```

使用 Node SQLite backup API，支持 WAL 一致快照，不能只复制运行中的 .sqlite 主文件。脚本生成备份但不自动上传、不自动加密、不自动定时删除。运营方需配置加密存储、每日计划、最长30天轮换与恢复演练；生产上线前验证实际计划。

DELETION_JOURNAL 保存删除请求的内部用户 ID 和时间，不含资料或邮箱，文件需与备份同等保护，并在数据库回滚时保留最新版本。它应备份到独立于数据库回滚的路径。不能随旧数据库一起回滚。

## 恢复

1. 停止应用，备份当前数据库和最新删除日志。
2. 将选定一致性备份恢复到新数据库路径；不要覆盖后立即启动。
3. 设置 DATABASE_PATH 为恢复库、DELETION_JOURNAL 为最新删除日志，执行 pnpm replay-deletions；缺少日志时脚本拒绝继续。
4. 执行迁移并检查 PRAGMA integrity_check、外键检查。
5. 撤销恢复库全部 session，再启动并要求用户重新登录。
6. 验证已删除账号未恢复、撤回授权仍关闭，再放开流量。若恢复点早于撤回记录，还须重放独立授权撤回日志（见下文）。

## 回滚与共享授权

应用回滚优先切回上一版代码，不回滚数据库。当前 schema 001 无降级脚本；未来先做向后兼容迁移。回滚数据库可能恢复旧授权状态，因此恢复时应保守地关闭全部邀请/授权、删除旧报告，要求重新邀请授权。这一步比尝试推断丢失的撤回记录可靠：

```sql
UPDATE invitation SET revoked_at = unixepoch('now')*1000;
UPDATE consent SET revoked_at = unixepoch('now')*1000;
DELETE FROM report;
DELETE FROM session;
```

上述恢复动作必须在停机恢复库上执行。正常应用删除与撤回接口不要求额外管理权限。

## 上线阻塞

真实 SMTP 投递、真实模型效果（若启用）、主机域名/发布授权、运营主体/邮箱/地区、实际加密备份轮换、线上端到端验证。以上不能由本地代码测试代替。
