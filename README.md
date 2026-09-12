# 同频 Compass

面向主动声明已满18岁的用户，邀请另一位成年人分别填写、分别授权，查看双向偏好满足情况和可讨论问题。年龄声明不是身份核验。本产品不预测关系成功，不给人排名。

## 当前状态

已实现独立账号、资料与偏好版本、邀请授权、确定性双向报告、AI 服务适配、撤回/导出/删除、移动端页面和部署准备。真实 AI、真实 SMTP、公开部署仍未验证。完整证据见 [验收表](docs/ACCEPTANCE.md)，不能把 Demo 当作真实服务。

## 环境与安装

要求 Node.js >=24.15（开发验证为24.19.0）、pnpm 11.19.0。依赖版本固定在 package.json 和 pnpm-lock.yaml。SQLite 使用 Node 内置模块，不需要外部数据库账号；该 Node API 在当前版本为候选稳定阶段，升级需重跑测试。

```sh
pnpm install --frozen-lockfile
node scripts/init-env.mjs
pnpm migrate
pnpm dev
```

打开 http://localhost:3000 。脚本创建本地 .env 并随机生成会话密钥，不打印密钥、不覆盖既有配置。也可从 .env.example 手动创建配置。不要将 .env、数据库、备份或 Demo 账号文件提交版本库。

本机若 pnpm 未加入 PATH，可以直接使用已安装的 pnpm 入口执行相同命令。Windows 开发时使用 PowerShell；本机沙箱不支持 tsx 所需用户信息接口时，需要普通本机终端运行。

## 使用流程

1. 分别注册两个邮箱密码账号（本地不验证邮箱，生产要求验证）；勾选成年声明。
2. 在“我的资料”填写自己的情况，在“择偶偏好”填写对伴侣的期待。等“已保存到账号”后离开。
3. 创建邀请；将链接自行交给对方。令牌仅首次返回，放在 URL fragment 中，不进入普通访问日志；服务端仅保存摘要。
4. 对方登录后接受。双方分别勾选分享维度、检查资料和偏好快照，再同意。默认全部私密。
5. 双方同意后点击生成报告。报告展示双方逐项授权的资料、偏好和双向匹配结果。A 是邀请发起人，B 是接受人；两个方向不合并。可以为不同参与者创建多份邀请，每份邀请及报告彼此隔离。
6. 再次打开报告；可选择 AI 讨论问题（双方都需授权）。资料更改后旧报告显示历史版本，新报告需新邀请和双方新授权。
7. 邀请页可撤回；设置页可导出本人数据或删除账号。删除报告会关闭该邀请并删除双方共享报告。

## 配置

| 变量                                              | 用途                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| APP_MODE                                          | development / test / demo / production；生产必须明确设置            |
| APP_ORIGIN、PORT                                  | 唯一可信浏览器来源、监听端口；生产来源必须 HTTPS                    |
| DATABASE_PATH                                     | 持久磁盘上的 SQLite 路径，默认 ./data/compass.sqlite                |
| BETTER_AUTH_SECRET                                | 至少32字符随机密钥，放主机 Secret/Environment 管理入口              |
| SMTP_HOST / PORT / USER / PASS / FROM             | 邮箱验证与密码恢复；未配置恢复接口明确503，不宣称已发信             |
| AI_MODE                                           | disabled / live；mock 只允许 APP_MODE=demo                          |
| AI_BASE_URL / AI_API_KEY / AI_MODEL               | 服务端 OpenAI-compatible chat/completions 适配，BASE_URL 通常含 /v1 |
| AI_PROVIDER_NAME / AI_PRIVACY_URL                 | 真实模型服务方与隐私说明，生产启用 AI 时必填                        |
| OPERATOR_NAME / CONTACT_EMAIL / DEPLOYMENT_REGION | 真实运营主体、联系邮箱、地区；生产缺失则拒绝启动                    |
| DELETION_JOURNAL                                  | 与备份恢复分开保留的删除日志文件，默认 ./data/deletions.jsonl       |

生产 AI_MODE=disabled 是明确不启用可选 AI，不会返回模拟内容。AI_MODE=live 缺配置直接启动失败。无论 AI 状态如何，匹配都由确定性引擎执行。

模型仅接收授权维度的规则结果（状态、权重和规则解释），不接收邮箱、实际城市、令牌或私人自由文本。结构化 Schema 要求3–5个问题；输入最多12000字符、响应最多24000字符、每次12秒超时、每次请求最多2次提供方尝试。每用户每小时3次应用请求，每报告生命周期最多2次请求；持久任务状态拒绝并发与重复生成，成功结果缓存。网络超时仍可能产生提供方费用，因此文档不承诺绝对零重复计费。

## 架构与数据

- React 19 + Vite，移动优先。语言文本入口预留 zh-CN，品牌位于 shared/domain.ts。
- Express 5 提供同源 API；Better Auth 负责账号、密码处理、会话和恢复。
- SQLite WAL + 外键；应用事务使用 BEGIN IMMEDIATE，版本保存采用预期版本检查，报告 invitation_id 唯一。
- profile、preference 保存不可变版本；consent 保存字段级授权快照；report 保存规则结果及版本。AI 状态在 report 上持久化，当前无需独立队列或 AIAnalysisJob 表。
- 认证表由固定版本 Better Auth 迁移；业务迁移位于 migrations/001.sql，含迁移版本记录。
- 服务端对象权限检查、写入来源检查、短期数据库限流、生产 Cookie/安全头、匿名健康检查。
- 邀请撤销或授权撤回永久关闭本轮。报告生成前邀请7天过期；报告生成后可持续访问到撤回/删除。

规则见 [MATCHING.md](docs/MATCHING.md)。数据库与接口实现集中于 server/，前端 src/，共享类型和引擎 shared/。

## 测试与构建

```sh
pnpm test
pnpm build
# 先在另一个终端启动 pnpm dev
pnpm test:e2e
```

端到端默认使用独立无头 Edge，上下文与个人浏览器隔离。在 Linux CI 使用 PLAYWRIGHT_CHANNEL=chromium，并先执行 pnpm exec playwright install --with-deps chromium。

API 测试创建临时数据库；浏览器测试创建虚构成人账号。AI 提供方测试和邮件恢复使用显式测试替身，没有发送真实邮件或调用付费模型。AI 内容评估须另按 [AI-EVALUATION.md](docs/AI-EVALUATION.md) 执行。

生产构建输出 dist/ 与 dist-server/：

```sh
pnpm build
pnpm migrate:production
pnpm start
```

此时 .env 必须配置为 production，或由进程管理器传入生产变量。不要公开部署开发服务器。干净安装验证见验收表。

## 独立 Demo

公开 /example 只是虚构数据的规则示例，不绕过任何用户 API。可运行完整独立 Demo：

PowerShell：

```powershell
$env:APP_MODE='demo'
$env:DATABASE_PATH='./data/compass-demo.sqlite'
$env:AI_MODE='mock'
$env:APP_ORIGIN='http://localhost:3002'
$env:PORT='3002'
pnpm seed
pnpm dev
```

账号随机密码写入被忽略的 data/demo-accounts.json。使用其中账号登录 http://localhost:3002，真实认证和对象权限与正常模式相同。Demo 页面固定显示“虚构成人资料 / 模拟 AI”。不要公开分享这些账号、不要把 Demo 数据库升级为生产库。

## 部署、备份、隐私

见 [DEPLOYMENT.md](docs/DEPLOYMENT.md)、[PRIVACY.md](docs/PRIVACY.md)、[TERMS.md](docs/TERMS.md)。目前没有线上地址。生产限单实例、本机持久磁盘；不可多副本共享 SQLite 文件，不支持无持久盘的 serverless 部署。未来有并发需求再迁移到独立关系型数据库。

仓库根目录的 `render.yaml` 可直接创建一个 Render Web Service、单实例和 1GB 持久磁盘。导入时仍需由运营者填写真实网址、SMTP 和运营信息并确认付费方案；配置不会把任何密钥提交到仓库。

生产限流保守地使用连接地址；反向代理后可能按代理共享额度。不要信任用户自行提交的 X-Forwarded-For。扩大用户规模前，应在受信代理层补充 IP 限流与邮件投递监测。

## 交付目录

- docs/ACCEPTANCE.md：逐项验收与实际证据。
- docs/DEMO.md：3分钟演示脚本。
- docs/AI-EVALUATION.md：正常/困难/异常 AI 样例和人工评估标准。
- docs/PROGRESS.md：问题、修复、验证记录及上线阻塞项。
- docs/evidence/：本地验证日志和页面截图。

已知限制：成年声明未核验；用户自述真实性无法保证；未完成真实模型效果评估或邮件投递验证；账号密码恢复依赖 SMTP；未知字段无法形成关系结论；应用撤回无法抹除对方截图；生产运维和法律审阅尚未完成。
