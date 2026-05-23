# 一触：项目核心代码与业务梳理

本文把项目里最重要的业务主线和核心代码整理成一份给初学者看的笔记，按“先看懂业务，再看懂代码”的顺序来。

## 1. 这个项目最核心的业务场景

项目的核心场景是：用户遇到一个英文单词，立刻收录进自己的词库，再补上释义，之后按间隔重复规则复习。

它解决的痛点主要有三个：

1. 背单词工具常常偏“查词”，但不够“记忆化”。
2. 传统输入方式不适合平板和手写笔用户。
3. 用户断网或弱网时，复习体验容易中断。

这个项目把流程做成了一个完整闭环：

```text
收词 -> 写释义/手写卡 -> 到期复习 -> 根据掌握程度安排下次复习
```

---

## 2. 核心数据流向图

### 2.1 复习主链路

```text
用户打开 Review 页面
  ↓
frontend/src/pages/ReviewPage.tsx
  调用 useReviewStore.startSession()
  ↓
frontend/src/store/reviewStore.ts
  调用 reviewApi.getReviewSession()
  ↓
frontend/src/api/client.ts
  自动附带 Authorization token
  ↓
后端 FastAPI
backend/main.py 挂载 /api/review
  ↓
backend/auth.py
校验 token，拿到 user_id 和 role
  ↓
backend/routers/review.py
GET /review/session
  ↓
backend/services/review_service.py
get_due_words() + get_review_stats()
  ↓
数据库 SQLite
words / definitions / review_records
  ↓
后端返回待复习卡片和统计数据
  ↓
前端展示 FlashCard
用户点击 Again / Good
  ↓
useReviewStore.gradeCard(quality)
  ↓
POST /api/review/submit
  ↓
backend/services/review_service.py
submit_review()
  ↓
SM-2 计算下一次复习间隔
  ↓
更新 review_records
  ↓
前端进入下一张卡
```

### 2.2 收词主链路

```text
QuickCapturePage 输入单词
  ↓
useWordStore.captureWord()
  ↓
POST /api/words
  ↓
backend/routers/words.py
create_word()
  ↓
backend/services/word_service.py
create_word()
  ↓
数据库 words 新增一行
  ↓
前端拿到 word.id
  ↓
继续添加 definition / example / collocation
  ↓
POST /api/words/{word_id}/definitions
  ↓
definitions 表新增释义
canvas_image 保存展示图
ink_data 保存手写笔迹
```

---

## 3. 项目里最骨干的代码模块

### 3.1 认证：`backend/routers/auth.py`

关键文件：
- [backend/routers/auth.py](../backend/routers/auth.py)
- [backend/auth.py](../backend/auth.py)
- [frontend/src/store/authStore.ts](../frontend/src/store/authStore.ts)
- [frontend/src/api/client.ts](../frontend/src/api/client.ts)

这条线负责：

1. 登录
2. 注册
3. 验证码发送
4. 密码重置
5. token 维护

最核心的逻辑可以理解成：

```python
if verify_admin_credentials(username, password, config):
    # 管理员登录，发 token
else:
    # 普通用户登录，查数据库 + 校验密码
```

它的价值在于：

- 前后端都只关心 token，不直接暴露密码逻辑
- 登录失败会走限流，避免暴力破解
- 前端用 `X-Auth-Session` 区分“旧请求”和“当前请求”，避免旧 401 把新状态冲掉

### 3.2 收词与词库：`backend/services/word_service.py`

关键文件：
- [backend/services/word_service.py](../backend/services/word_service.py)
- [backend/routers/words.py](../backend/routers/words.py)
- [frontend/src/store/wordStore.ts](../frontend/src/store/wordStore.ts)
- [frontend/src/pages/QuickCapturePage.tsx](../frontend/src/pages/QuickCapturePage.tsx)

这部分负责：

1. 创建单词
2. 查询单词
3. 搜索和建议
4. 添加/更新/删除释义
5. 维护 `definition_count` 和 `review_ready`

它的业务骨架是：

```python
create_word() -> 新增 Word
get_word() -> 带上 definitions
add_definition() -> 新增 Definition，并写入 example/collocation
update_definition() -> 更新已有释义
```

这里值得注意的点：

- `word.user_id` 让每个用户的数据隔离
- `order` 让同一个单词下的释义顺序稳定
- `review_ready` 是派生状态，方便前端直接判断能不能复习

### 3.3 复习调度：`backend/services/review_service.py`

关键文件：
- [backend/services/review_service.py](../backend/services/review_service.py)
- [backend/srs/sm2.py](../backend/srs/sm2.py)
- [backend/srs/base.py](../backend/srs/base.py)
- [frontend/src/store/reviewStore.ts](../frontend/src/store/reviewStore.ts)

这部分是项目的灵魂。

核心骨架：

```python
get_due_words() -> 找出该复习的单词
submit_review() -> 写入本次评分，更新 next_review
get_review_stats() -> 统计今天复习了多少、还有多少到期
```

复习评分的核心就是 SM-2 算法：

```python
if quality >= 3:
    # 正确回答，重复次数增加，间隔变长
else:
    # 错误回答，重置重复次数和间隔
```

它妙在把“记忆强弱”变成了一个可计算状态：

- 记得越稳，间隔越长
- 记不住，就重新拉近复习时间

### 3.4 前端复习状态：`frontend/src/store/reviewStore.ts`

这块负责把后端的复习数据组织成页面可用的状态：

1. 拉取复习会话
2. 分组
3. 翻卡
4. 打分
5. 离线缓存

关键模式：

- `GROUP_SIZE = 5`：每组 5 张卡，降低认知负担
- `queue`：当前组的工作队列
- `quality === 1` 时把卡重新塞回队尾，形成“Again 重新复习”的行为
- `startSessionPromise`：防止重复发起会话请求

### 3.5 离线复习：`frontend/src/utils/offlineReviewQueue.ts`

这部分是项目里非常实用的一段。

它做了两件事：

1. 把待同步的评分存到 localStorage
2. 网络恢复后批量补发

它本质上是一个“本地队列 + 重放机制”：

```text
网络失败
  -> 先记到本地
网络恢复
  -> flush 到后端
```

这能保证弱网环境下复习不被打断。

---

## 4. 这份代码里有哪些经典算法 / 设计模式

### 4.1 SM-2 间隔重复算法

位置：[backend/srs/sm2.py](../backend/srs/sm2.py)

这是最经典的算法之一，作用是根据用户回忆表现动态调整下次复习间隔。

妙处：

- 简单
- 可解释
- 非常适合背单词

### 4.2 策略模式

位置：[backend/srs/base.py](../backend/srs/base.py)、[backend/srs/sm2.py](../backend/srs/sm2.py)

`BaseSRS` 定义接口，`SM2Algorithm` 负责具体实现。  
以后如果想换别的复习算法，不需要改业务主流程，只换策略实现。

### 4.3 工厂模式

位置：`SRSFactory("sm2")`、`LLMFactory(...)`

项目通过工厂去创建具体算法/供应商实例，这样调用方不用知道内部到底是哪一种实现。

### 4.4 本地队列 / 重放机制

位置：[frontend/src/utils/offlineReviewQueue.ts](../frontend/src/utils/offlineReviewQueue.ts)

这是一个很典型的工程化模式，适合离线/弱网场景。

### 4.5 分层架构

后端明显是：

```text
router -> service -> model
```

前端明显是：

```text
page -> store -> api -> ui component
```

这是这套代码最值得初学者学的地方。

---

## 5. 建议阅读顺序

如果你想最快吃透项目，我建议按这个顺序看：

1. [backend/routers/auth.py](../backend/routers/auth.py)
2. [backend/services/word_service.py](../backend/services/word_service.py)
3. [backend/services/review_service.py](../backend/services/review_service.py)
4. [backend/srs/sm2.py](../backend/srs/sm2.py)
5. [frontend/src/store/reviewStore.ts](../frontend/src/store/reviewStore.ts)
6. [frontend/src/utils/offlineReviewQueue.ts](../frontend/src/utils/offlineReviewQueue.ts)

---

## 6. 一句话总结

这不是一个“页面堆很多”的项目，而是一个很完整的背单词闭环：

```text
登录认证 -> 收词建档 -> 补充释义 -> SM-2 复习 -> 离线同步
```

它最适合初学者学习的地方，是“怎么把一个想法拆成清晰的前后端分层”，而不是某一行特别炫的代码。

---

## 7. 面试视角：项目含金量与简历表达

这一节站在大厂技术面试官的角度，总结这个项目能体现的工程能力。面试时不要只说“我做了一个背单词应用”，而要说清楚：你解决了什么问题，做了哪些技术取舍，系统如何保证稳定性，以及哪些设计方便后续扩展。

### 7.1 技术选型权衡

#### 选型一：FastAPI + SQLAlchemy Async

项目后端选择 FastAPI 和异步 SQLAlchemy，比较适合这个应用的体量和演进方向。

合理理由：

1. FastAPI 天然适合 API 型应用，类型提示、Pydantic 校验和自动文档能力强，能让接口契约更清晰。
2. 项目存在 LLM 增强、邮件发送、数据库访问等 I/O 型场景，异步框架可以减少请求阻塞，为后续并发访问留出空间。
3. SQLAlchemy ORM 把业务对象和数据库表结构解耦，方便维护 `Word`、`Definition`、`ReviewRecord` 这类关系模型。

面试表达：

> 后端采用 FastAPI + SQLAlchemy Async，主要考虑接口开发效率、类型约束和 I/O 并发能力。业务层通过 service 封装数据库操作，避免路由层直接堆 SQL，提高了可维护性。

#### 选型二：SQLite 而不是 MySQL/PostgreSQL

这个项目当前更偏个人自托管和轻量使用，因此 SQLite 是合理选择。

合理理由：

1. 部署成本低，不需要额外数据库服务，适合自托管、小规模用户和本地优先场景。
2. 背单词数据结构相对清晰，核心读写集中在 `words`、`definitions`、`review_records`，SQLite 足够承载当前规模。
3. 项目已经通过索引、备份、异步会话等方式提升可用性；如果未来用户量扩大，SQLAlchemy 也方便迁移到 PostgreSQL。

面试表达：

> 存储层选择 SQLite 是基于产品阶段和部署复杂度的权衡。当前目标是低成本自托管和快速验证，SQLite 能满足数据规模；同时通过 SQLAlchemy 抽象数据库访问，为后续迁移到 PostgreSQL 保留空间。

#### 选型三：React + TypeScript + Zustand

前端选择 React + TypeScript + Zustand，适合这种中小型但交互状态较多的应用。

合理理由：

1. TypeScript 能约束 `Word`、`ReviewCard`、`ReviewSubmit` 等关键数据结构，减少前后端字段不一致的问题。
2. Zustand 比 Redux 更轻量，适合管理认证状态、词库状态、复习状态这几类局部但重要的全局状态。
3. 复习页面有翻卡、分组、离线队列、缓存恢复等状态变化，集中在 store 中更容易维护和测试。

面试表达：

> 前端没有引入过重的状态框架，而是使用 Zustand 管理认证、词库和复习会话状态。这样既保持了低复杂度，又能把页面展示和业务状态迁移逻辑分开。

### 7.2 核心技术攻坚

#### 难点一：复习调度和记忆状态建模

最复杂的业务逻辑是复习调度。系统不是简单地把单词列表展示出来，而是要根据用户每次复习表现动态计算下次复习时间。

技术挑战：

- 如何判断哪些单词“现在该复习”
- 如何根据评分更新记忆强度
- 如何保证新词、旧词、答错的词都能进入合理的复习节奏

解决方案：

- 使用 `review_records` 独立记录每个单词的复习状态
- 使用 SM-2 算法计算 `ease_factor`、`interval_days`、`repetitions`、`next_review`
- 通过 `get_due_words()` 只拉取“有释义且到期”的单词
- 前端按 5 张一组组织复习，降低用户认知负担

含金量表述：

> 项目实现了基于 SM-2 的间隔重复系统，将用户评分转化为可持久化的记忆状态，并通过 `next_review` 驱动复习队列生成，实现了从“静态词库”到“个性化复习系统”的升级。

#### 难点二：弱网/离线复习的一致性处理

复习行为很怕网络中断。如果用户打了分但请求失败，直接丢掉会破坏学习记录。

技术挑战：

- 网络失败时不能阻塞用户继续复习
- 本地记录不能重复提交或永久丢失
- 网络恢复后要补偿同步
- 已复习卡片要从本地缓存中移除，避免重复出现

解决方案：

- 使用 localStorage 维护 pending review queue
- 评分提交失败时，把 `{ word_id, quality }` 入队
- 下次启动或网络恢复时调用 `flushPendingReviews`
- 同步成功后移除对应缓存卡片

含金量表述：

> 针对弱网场景设计了本地复习队列和补偿同步机制。用户评分先乐观推进 UI，失败时写入本地队列，网络恢复后重放请求，在体验连续性和数据最终一致性之间做了平衡。

### 7.3 健壮性与异常处理

项目里有多层防护，保证系统不会因为常见异常直接崩掉。

#### 网络异常

- 前端请求失败时不会直接让页面崩溃，而是进入离线状态。
- 复习评分失败时进入 pending queue，后续再同步。
- 复习会话会缓存 5 分钟，短暂断网时仍然可以继续展示卡片。

#### 非法输入

- 后端用 Pydantic schema 校验请求，例如单词长度、复习评分范围、释义字段。
- 注册、重置密码时校验邮箱格式和密码长度。
- LLM 返回内容通过 schema 约束，过滤无效词性和空释义。

#### 认证异常

- 所有敏感业务接口都通过 `require_auth` 校验 token。
- 登录失败有限流，避免暴力破解。
- 前端统一拦截 401，并清理旧登录状态。
- `X-Auth-Session` 避免旧请求误伤当前会话。

#### 数据一致性

- 后端通过数据库事务提交，失败时回滚。
- 创建释义时先 `flush` 拿到 definition id，再写入例句和搭配，保证外键关系正确。
- 普通用户查询时统一加 `user_id` 范围限制，避免越权访问别人的词库。

面试表达：

> 项目在前后端都做了异常兜底：前端用请求拦截器、离线队列和本地缓存保证体验连续性；后端用 Pydantic 校验、事务提交、认证中间件和用户数据隔离保证接口安全和数据一致性。

### 7.4 三条设计亮点

#### 亮点一：低耦合的分层架构

后端采用：

```text
router -> service -> model/schema
```

前端采用：

```text
page -> store -> api -> component
```

设计价值：

- router 只负责 HTTP 输入输出
- service 承载业务规则
- model/schema 负责数据结构
- 前端页面不直接堆复杂业务状态

专业表述：

> 项目采用低耦合分层架构，将接口层、业务层、数据层和前端状态层拆分，降低了模块间依赖，提高了可维护性和可测试性。

#### 亮点二：可扩展的算法与供应商适配

项目把 SRS 算法和 LLM 供应商都做成了注册表/工厂模式。

设计价值：

- 复习算法可以从 SM-2 扩展到其他算法
- LLM 供应商可以在 OpenAI、Ollama、Doubao、Anthropic 间切换
- 业务层不需要关心具体实现类

专业表述：

> 通过策略模式和工厂模式封装 SRS 算法与 LLM Provider，使核心业务逻辑与具体算法/供应商解耦，增强了系统可扩展性。

#### 亮点三：面向弱网的高可用体验

项目不是只考虑“网络正常”的理想路径，而是对离线复习做了设计。

设计价值：

- 网络失败时不阻塞主流程
- 用户操作先本地落盘
- 后续通过补偿同步达到最终一致性
- 本地缓存提高短时离线可用性

专业表述：

> 项目在前端实现了离线优先的复习队列和补偿同步机制，通过本地缓存和请求重放提升弱网场景下的可用性，并保证复习记录最终一致。

### 7.5 可写进简历的项目经历

可以写成下面这种风格：

```text
一触：自托管英语单词记忆与手写复习系统

- 基于 React + TypeScript + Zustand + FastAPI + SQLAlchemy Async 构建全栈背单词应用，实现收词、手写释义、间隔重复复习、AI 释义增强、离线复习和用户认证等核心功能。
- 设计并实现基于 SM-2 算法的复习调度模块，将用户评分映射为 ease_factor、interval_days、repetitions、next_review 等持久化记忆状态，实现个性化复习队列。
- 针对弱网场景实现本地复习队列和补偿同步机制，提交失败时将评分写入 localStorage，网络恢复后批量重放请求，保证复习体验连续性和数据最终一致性。
- 后端采用 router-service-model 分层架构，通过 Pydantic schema、HMAC token、用户数据范围过滤和事务提交保证接口安全、输入可靠性和数据一致性。
- 使用工厂模式封装 SRS 算法和 LLM Provider，支持后续扩展不同复习算法及 OpenAI/Ollama/Doubao/Anthropic 等多种模型供应商。
```

### 7.6 面试时可以主动讲的项目故事

面试官通常不喜欢只听功能列表，更想听你如何做权衡。可以这样讲：

> 这个项目一开始只是词库和复习卡片，但我没有把它做成简单 CRUD，而是围绕“个人记忆系统”设计了完整闭环。后端把收词、复习、AI 增强拆成 service 层，前端用 Zustand 管理复习会话。最核心的是 SM-2 复习调度和离线复习队列：前者解决“什么时候复习”的问题，后者解决“网络不好时用户操作不能丢”的问题。整体架构虽然轻量，但保留了扩展空间，比如数据库可迁移、LLM Provider 可切换、SRS 算法可替换。
