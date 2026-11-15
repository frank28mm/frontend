# TINT 前端 Web

这是 `TINT` 的用户侧前端子仓，负责作业上传、批改结果、AI 辅导、学习报告、个人中心、订阅和管理后台等 Web/H5 页面。

## 这个前端负责什么

- 首页状态与孩子档案切换
- 拍照/上传作业
- 批改任务轮询与结果页
- 题目详情与 AI Tutor
- 历史记录、错题流和学习报告
- 登录、订阅、个人中心、管理后台

## 技术栈

- React 19
- TypeScript
- Vite
- React Router
- SWR
- Framer Motion
- KaTeX

## 推荐阅读顺序

1. `src/App.tsx`
2. `src/AppRouter.tsx`
3. `src/pages/Home.tsx`
4. `src/services/api.ts`
5. `src/contexts/ProfileContext.tsx`
6. `src/pages/Upload.tsx`
7. `src/pages/ResultSummary.tsx`
8. `src/pages/AITutor.tsx`
9. `docs/walkthrough_ui_implementation.md`

## 主流程

### 作业批改

`Home -> Camera/Upload -> /uploads -> /grade -> useJobPolling -> Result/ResultSummary -> QuestionDetail -> AITutor`

### 学习报告

`Analysis -> /reports/eligibility -> /reports -> /reports/jobs/:id -> ReportGenerating -> ReportDetail`

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址：

- 前端：`http://127.0.0.1:5173`
- API 代理：`/api/v1 -> http://127.0.0.1:8000`

说明：

- 只跑前端并不代表主流程可用，批改、报告、登录等能力依赖后端。
- 本地开发时若不接真实后端，可以通过环境变量启用 mock。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run coverage
npm run preview
```

## 关键环境变量

- `VITE_API_BASE_URL`
  - 默认 `/api/v1`
- `VITE_USE_MOCK`
  - 为 `true` 时启用上传/批改/历史 mock 链路
- `VITE_DEV_USER_ID`
  - 本地开发兜底用户 ID
- `VITE_FEATURE_ENGLISH_RENDER_ENABLED`
  - 英语历史、错题、数据中心和分析报告等读取界面的发布开关
- `VITE_FEATURE_ENGLISH_SUBMISSION_ENABLED`
  - 英语新提交的前端发布开关；后端 `/capabilities` 仍是运行时最终权限来源
- `VITE_FEATURE_PHYSICS_RENDER_ENABLED` / `VITE_FEATURE_PHYSICS_SUBMISSION_ENABLED`
  - 物理读取界面与新提交的独立发布开关
- `VITE_FEATURE_CHEMISTRY_RENDER_ENABLED` / `VITE_FEATURE_CHEMISTRY_SUBMISSION_ENABLED`
  - 化学读取界面与新提交的独立发布开关

## 当前已知情况

- 根入口和页面骨架已经比较完整，不是脚手架项目。
- 前端真实入口在代码里，不在文档里；本 README 的作用是帮后来者尽快找到入口。
- 仓内 `docs/` 目前只有 UI 实施纪要，更多产品/设计真源位于后端子仓的 `docs/`。
- 目前仍需继续明确哪些页面已经完全接入真实 API，哪些还保留 mock / 静态占位。
- 用户可见品牌口径已统一为 `TINT`；少量历史工程键仍保留作兼容用途，例如 `homework_frontend_language`。

## 测试现状

当前已见的前端自动化覆盖主要集中在：

- submission 相关页面回归
- Toast 组件
- 少量 util 单测

因此在接手改动前，建议把本次改动涉及的关键页面手动走一遍。

## 相关入口

- 项目根入口：`../PROJECT_MAP.md`
- 项目根 README：`../README.md`
- 后端真源：`../TINT服务器/README.md`
- 后端架构说明：`../TINT服务器/system_architecture.md`
