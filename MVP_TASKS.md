# 小灵 MVP 任务清单

**更新时间**: 2026-04-24
**MVP 定义**: 匿名记忆 + 主动陪伴 Demo + 角色可切换 + 响应式 UI,网页形态(PWA)发布,**不做桌面端**
**预计总工期**: ~2 周

---

## 0. 前置依赖(开工前必须搞定)

- [x] **SSH 代理白名单**:`47.95.119.182` 已加到 DIRECT(2026-04-24 验证连通,容器 `ten_agent_dev` 健康)
- [ ] **API Keys 清单**:
  - [x] 和风天气 API Key(免费版 1000 次/天,天气 MCP 用)— Host + Key 存服务器环境变量(`QWEATHER_HOST` / `QWEATHER_KEY`),不进 git
  - [ ] 通义千问 API Key(多模型切换,可选)
  - [ ] OpenAI API Key(多模型切换,可选)
  - [ ] 博查搜索 API Key(搜索 MCP,推迟到 Post-MVP)
- [ ] **老板拍板事项**:
  - [ ] 确认主动陪伴是产品主路线
  - [ ] 确认 MVP 暂不做桌面端(用 PWA 替代)
  - [ ] 自研 Live2D 形象立项,美术/建模排期

---

## 1. 里程碑 M1:基础能力升级(5-7 天)

### 1.1 UI 改版 — 3-4 天
- [ ] 竖屏(手机浏览器):对话区默认占屏幕 1/3,点击自动展开
- [ ] 横屏(网页):左右分栏布局(角色 + 对话)
- [ ] 右上角设置入口(drawer/panel 骨架,先空壳)
- [ ] 窗口 resize 时 Live2D canvas 自动 `app.renderer.resize()`
- [ ] 响应式断点用 `useMediaQuery` 判定 orientation
- [ ] 过渡动画用 `framer-motion` 的 `AnimatePresence`

**依赖**: 无

### 1.2 匿名 Memory 系统 — ✅ 2026-04-24 上线(含多用户)
- [x] 前端 `frontend/src/lib/userIdentity.ts`:首次访问 `crypto.randomUUID()` 生成,写入 `localStorage['xiaoling_uid']`;隐身模式 fallback 到会话级临时 UID
- [x] 前端 `frontend/src/lib/persona.ts`:`PERSONA_PROMPT_BASE` + `buildPromptForUser(uid)` 把 `[CURRENT_USER_ID=<uid>]` 拼进 prompt
- [x] 前端 `frontend/src/hooks/useAgentLifecycle.ts`:`/start` 通过 `properties.llm.prompt` override 注入(利用 TEN **字段级 deep-merge**,不覆盖 base_url/api_key)
- [x] 新建 `memory_mcp_server.py`(port 7779,FastMCP + SSE + SQLite)
  - [x] 表:`memories(id, uid, content, created_at)` + index `(uid, created_at DESC)`
  - [x] Tool: `recall(uid)` → 最近 50 条记忆,新用户有专门提示
  - [x] Tool: `remember(uid, content)` → 写记忆,>500 字截断
  - [x] 空/异常 uid 落到 `_unknown` 桶,绝不丢数据
- [x] `property.json` 加 `mcp_memory` 节点 + `tool_register` 挂载
- [x] system prompt 加 recall/remember 指引(本地 `persona.ts` 和 `property.json` 双维护,M2.3 统一)
- [x] DB 路径 `/app/agents/examples/websocket-example/.memory/memory.db`(bind-mount 到 host,容器重建不丢)
- [x] 多用户隔离直接 DB 验证通过 ✅
- [x] Worker 启动日志确认 recall/remember 注册到 LLM ✅
- [ ] (Post-MVP)升级项:向量检索 / profile 蒸馏 / 跨设备同步 / hermes Honcho / systemd 自启

**依赖**: SSH ✅ | DB 持久化 ✅ | TEN `/start` override ✅

### 1.3 Context MCP(时间 + 农历 + 天气)— ✅ 2026-04-24 上线
- [x] 新建 `context_mcp_server.py`(port 7778,FastMCP + SSE,仿 fetch_mcp 模板)
  - [x] Tool: `get_current_time()` — 年月日、星期、时段(早上/上午/中午/下午/傍晚/晚上/深夜)
  - [x] Tool: `get_lunar_date()` — 干支纪年、生肖、农历月日、节气(今日或近 7 天)、节日
  - [x] Tool: `get_weather(city?)` — 和风天气 v7,支持 12 个常用城市,默认北京
- [x] `property.json` 改造:
  - [x] 删除孤儿 `weatherapi_tool_python` 节点(原本 env var 没设,空跑)
  - [x] 新增 `mcp_context` 节点(`mcp_client_python` → `127.0.0.1:7778/sse`)
  - [x] `main_control` 的 `tool_register` source 列表更新
- [x] system prompt 加指示:会话开始前先调 get_current_time + get_lunar_date
- [x] 部署验证:worker 启动时三个工具均 register 成功,graph 无报错
- [x] 同时修复了**本地 overlay 与服务器 drift** 问题(把服务器 property.json 拉回来做 source of truth)

**依赖**: 和风天气 Key ✅ | 服务器 SSH ✅ | `lunar-python` 已装进容器

### 1.4 PWA 壳 — 0.5 天
- [ ] `public/manifest.json`:app name / icons / theme_color / start_url / display: standalone
- [ ] 接入 `next-pwa` 生成 service worker
- [ ] iOS Safari 适配 meta(`apple-mobile-web-app-capable` 等)
- [ ] 验证:Mac Chrome "安装" / iOS Safari "添加到主屏"可用

**依赖**: 无

---

## 2. 里程碑 M2:陪伴 Demo(2-3 天)

### 2.1 主动问候 Demo 按钮 — 1-2 天
- [ ] 前端:右上角(或 `?demo=1` 才显示)加"演示主动问候"按钮
- [ ] 后端新增 API `/proactive_greet?uid=xxx`
  - [ ] 调 memory MCP 拉 profile
  - [ ] 调 context MCP 拉 time/weather/lunar
  - [ ] 组装特殊 prompt → 调 LLM 生成开场白
  - [ ] 推回前端 WebSocket,走现有 TTS 播报
- [ ] 话术调优:早上/下午/晚上/深夜 4 种时段的不同口吻
- [ ] 记忆场景:已知用户偏好 vs 新用户的不同开场

**依赖**: M1.2 memory + M1.3 context MCP 跑通

### 2.2 多模型切换 — 1 天
- [ ] `property.json` 的 `predefined_graphs` 改为多 graph:
  - [ ] `xiaoling_deepseek`(现有,默认)
  - [ ] `xiaoling_qwen`(通义,需 `openai_llm2_python` 扩展 + DashScope 兼容 URL)
  - [ ] `xiaoling_gpt`(可选)
- [ ] 前端调 `/start` 时带 `graph_name` 参数
- [ ] 切换时优雅关闭旧 session → 起新 session

**依赖**: 目标 API Keys 到位

### 2.3 设置面板填充 — 1 天
- [ ] 切换模型(对接 2.2)
- [ ] 自定义背景:预设 4-6 张 + 支持上传本地图
- [ ] 切换角色下拉(对接 M3 的 Persona 结构,先占位)
- [ ] 声音开关 / 音量条
- [ ] 配置持久化(存 `localStorage['xiaoling_settings']`)

**依赖**: 2.2

---

## 3. 里程碑 M3:角色化(2-3 天 + 等模型)

### 3.1 Live2D 交付规格文档 — 0.5 天
- [ ] 写 `docs/LIVE2D_SPEC.md`,包含:
  - [ ] Cubism 4 导出设置(纹理 ≤2048、精度、压缩)
  - [ ] 标准参数命名表(ParamMouthOpenY / ParamEyeBlink* / ParamAngle* / 情绪类 ~15 项)
  - [ ] 动作清单(Idle 循环 / Talk 叠加 / Greet / Nod,必备 4-5 条)
  - [ ] 表情清单(可选 4-6 个,如 smile / shy / thinking)
  - [ ] 物理配置要点(头发/衣服摆动)
  - [ ] 交付文件目录结构
- [ ] 发给美术/建模同事

**依赖**: 无

### 3.2 Live2D 切换接口改造 — 1-2 天
- [ ] 定义 TS 接口:
  ```ts
  interface AvatarPersona {
    id: string;
    name: string;
    modelPath: string;
    mouthParam?: string;   // 默认 ParamMouthOpenY
    mouthGain?: number;    // 默认 1.5
    idleMotion?: string;
    talkMotion?: string;
    scale?: number;
    offset?: { x: number; y: number };
  }
  ```
- [ ] `AvatarLive2D.tsx` 接受 `persona` prop,切换时:
  - [ ] destroy 老 model(所有 PIXI resources)
  - [ ] load 新 model
  - [ ] 重新绑定 AnalyserNode 做口型
- [ ] 内存泄漏测试:连续切 20 次看 DevTools Memory
- [ ] `public/live2d/personas.json` 注册表,前端从这读可选列表

**依赖**: SSH 打通 + 审读 `AvatarLive2D.tsx` 现状

### 3.3 自研形象接入 — 1 天
- [ ] 公司交付模型 → `public/live2d/<name>/`
- [ ] 在 `personas.json` 注册
- [ ] 口型参数对齐测试(RMS → mouth open 灵敏度)
- [ ] 动作/表情触发时机调试(开场 greet / 说话 talk / 沉默 idle)

**依赖**: 公司交付 Live2D 模型

---

## 4. Post-MVP 任务(不排期,心里有数)

### 产品增强
- [ ] Tauri 桌面端打包(系统通知 + 开机自启 + 系统托盘)
- [ ] 真 cron 主动触达(替代 Demo 按钮)
- [ ] 飞书 MCP 接入(lark-openapi-mcp,beta,需要 SSE 包装)
- [ ] 钉钉 MCP 接入(TEN 原生 `dingtalk_bot_tool_python`)
- [ ] 搜索 MCP(博查 / Bing)
- [ ] 新闻 RSS MCP(36kr / 少数派)
- [ ] TODO/记事 MCP(和 memory 共用 SQLite)
- [ ] IP 定位 MCP
- [ ] 手机号绑定 → 跨设备同步记忆
- [ ] 微信小程序版本
- [ ] iOS 原生 APP

### 技术升级
- [ ] Memory 向量检索(sqlite-vss / Chroma)
- [ ] 评估升级到 hermes-agent 的 Honcho 用户模型
- [ ] 评估接入 openclaw 做多渠道触达
- [ ] 文本输入 fallback(麦克风拒绝权限时)
- [ ] AGORA_APP_ID 改造(patch `/app/server/main.go` line 53)
- [ ] systemd unit 让所有 MCP / API / Frontend 开机自启

---

## 5. 工期总览

| 里程碑 | 内容 | 工期 |
|---|---|---|
| M0 前置 | SSH / Keys / 老板确认 | 0.5 天 |
| M1 基础能力 | UI + Memory + Context + PWA | 5-7 天 |
| M2 陪伴 Demo | Demo 按钮 + 多模型 + 设置面板 | 2-3 天 |
| M3 角色化 | Live2D 规格 + 切换接口 + 接入 | 2-3 天 + 等模型 |
| **MVP 合计** | | **~2 周** |

---

## 6. 决策日志

| 日期 | 决策 | 背景 |
|---|---|---|
| 2026-04-24 | MVP 不做桌面端,用 PWA 替代 | 减少打包调试成本,专注陪伴感打磨;桌面端留给下一版 |
| 2026-04-24 | Memory 用 LocalStorage UUID + SQLite,不做账号系统 | 降门槛;跨设备同步留给 Post-MVP |
| 2026-04-24 | 主动陪伴做演示按钮,不做真 cron | Demo 可控,避免现场冷场;管道本身复用,非废代码 |
| 2026-04-24 | 短期不融入 hermes-agent,自己搭简化版 | 1 周 vs 1 个月,先验证产品形态,陪伴感上限瓶颈其实在 persona/数据,不在 agent 框架 |
| 2026-04-24 | Live2D 自研形象由公司美术出(Cubism 4) | 品牌化需要;接入层做成"丢文件即可切换" |
| 2026-04-24 | MCP 优先做 memory + context(time/weather/lunar) | 陪伴感性价比最高;日历/搜索/新闻推 Post-MVP |

---

## 7. 备忘与开放问题

- [ ] 话术 persona 手册(小灵怎么说话)需要一份单独文档,目前散在 `property.json` 的 system prompt 里
- [ ] 音量/音色用户有没有偏好调节需求?目前 Minimax TTS 固定 "tianmei"
- [ ] PWA 版本在 iOS Safari 能不能后台播音?未测,影响"被动语音触达"设计
- [ ] 用户不在线时的主动推送:MVP 不做,但要想好 Post-MVP 要走 Web Push 还是依赖桌面/APP
