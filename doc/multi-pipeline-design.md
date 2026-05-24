# Multi-Pipeline 设计文档

## 概述

YouDub-webui 原本只支持一条固定的 9 步全流程 pipeline（下载→分离→ASR→断句→翻译→切分音频→TTS→混音→合成视频）。本次改造引入了多 pipeline 支持，用户可以根据需求选择不同的处理流程，同时增加了语言覆盖、从指定阶段重跑、Markdown 格式摘要等功能。

---

## Pipeline 类型

定义在 `backend/app/stages.py` 的 `PIPELINES` 字典中：

| Pipeline | 说明 | 阶段 |
|---|---|---|
| `full` | 完整配音（默认） | download → separate → asr → asr_fix → translate → split_audio → tts → merge_audio → merge_video |
| `subtitles` | 字幕翻译，不配音 | download → separate → asr → asr_fix → translate |
| `summarize` | 视频内容摘要 | download → asr → summarize |
| `karaoke` | 人声/伴奏分离 | download → separate |

### ASR 阶段 fallback

summarize pipeline 跳过了 Demucs 分离步骤，因此 ASR 阶段没有 vocals 文件。`pipeline.py` 中的 `_asr()` 做了 fallback：

```python
audio_file = self.artifacts.vocals_file or self.artifacts.video_file
```

当 `vocals_file` 为 None（pipeline 跳过了 separate）时，直接使用原始视频音频做 ASR。

### Summarize 阶段

新增的 `summarize` 阶段调用 LLM（通过 OpenAI 兼容 API）生成 Markdown 格式的中文摘要。输出文件为 `session/metadata/summary.json`，包含：

- `source_language`：源语言
- `summary_markdown`：Markdown 格式的摘要文本
- `full_text`：ASR 完整原文

---

## 语言覆盖（Language Override）

### 问题

原有的语言检测基于 URL 来源：
- YouTube → `asr_language=en`, `target_language=zh`
- Bilibili → `asr_language=zh`, `target_language=en`

但 YouTube 上的中文视频也会被错误地当作英文来处理。

### 解决方案

新增 `language` 参数，允许用户手动覆盖 ASR 语言。当 `language` 非 null 且非 "auto" 时，覆盖 `asr_language` 并自动推断 `target_language`（en↔zh 互换）。

实现位置：`backend/app/sources.py` 的 `source_with_language()` 函数。

```python
def source_with_language(url: str, language: str | None = None) -> SourceConfig:
    source = detect_source(url)
    if not language or language == "auto":
        return source
    target = "en" if language == "zh" else "zh"
    return SourceConfig(
        name=source.name,
        matches=source.matches,
        use_proxy=source.use_proxy,
        cookie_filename=source.cookie_filename,
        asr_language=language,
        target_language=target,
    )
```

`pipeline.py` 中所有 `detect_source()` 调用都已替换为 `source_with_language()`。

---

## 从指定阶段重跑（Rerun From Stage）

### 问题

原有设计只有两种恢复方式：
- `rerun`：完全重跑，删除所有中间产物
- `resume`：仅对失败任务，从失败阶段继续

对于已完成的任务，如果想重跑某个阶段（如调整 summarize prompt 后重新生成摘要），只能从头开始。

### 解决方案

新增 `POST /api/tasks/{id}/rerun-from` 端点，接受 `{"stage": "summarize"}` 参数。

实现逻辑（`database.py` 的 `reset_stages_from()`）：

1. 根据 pipeline 配置确定阶段顺序
2. 将指定阶段及其后续阶段重置为 `pending`
3. 删除被重置阶段的输出文件（通过 `_delete_stage_outputs()`）
4. 将任务状态设为 `queued`，`current_stage` 指向重置的起始阶段
5. 重新入队

已有的阶段缓存机制（`_run_stage()` 检查 `_stage_status()` 是否为 `succeeded`）自动跳过未重置的阶段。

### 输出文件清理

重置阶段时必须删除对应的输出文件，否则适配器的 `if output_file.exists(): return output_file` 会导致跳过重新生成。

`_delete_stage_outputs()` 处理每个阶段的输出文件映射：

| 阶段 | 删除的文件 |
|---|---|
| download | `media/video_source.mp4` |
| separate | `media/audio_vocals.wav`, `media/audio_bgm.wav` |
| asr | `metadata/asr.json` |
| asr_fix | `metadata/asr_fixed.json` |
| translate | `metadata/translation.*.json` |
| split_audio | `segments/vocals/` 目录 |
| tts | `segments/tts/` 目录 |
| merge_audio | `tmp/audio_dubbing.wav`, `metadata/timings.json` |
| merge_video | `media/video_final.mp4` |
| summarize | `metadata/summary.json` |

---

## API 变更

### 新增端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/pipelines` | 返回所有 pipeline 配置 |
| POST | `/api/tasks/{id}/rerun-from` | 从指定阶段重跑 |
| GET | `/api/tasks/{id}/artifact/summary` | 获取摘要数据 |

### 变更的端点

| 端点 | 变更 |
|---|---|
| `POST /api/tasks` | 新增 `pipeline`（默认 "full"）和 `language`（默认 null）参数 |
| `POST /api/tasks/upload` | 同上 |
| `POST /api/tasks/{id}/rerun` | 保留原有的 `pipeline` 和 `language` |

### 去重逻辑

`POST /api/tasks` 的去重现在考虑 pipeline：
- 同 URL + 同 pipeline → 返回已有任务
- 同 URL + 不同 pipeline → 创建新任务（使用 UUID 作为 task_id，避免 PRIMARY KEY 冲突）

---

## 数据库变更

### 新增列

| 表 | 列 | 类型 | 默认值 | 说明 |
|---|---|---|---|---|
| tasks | pipeline | TEXT | 'full' | Pipeline 类型 |
| tasks | language | TEXT | NULL | 语言覆盖 |

### create_task 变更

现在只创建当前 pipeline 对应的阶段记录，而非全部 9 个阶段。阶段标签从 `STAGES` 查找。

---

## 前端变更

### 首页（page.tsx）

- **Pipeline 选择卡片**：4 种 pipeline 以卡片形式展示，选中项高亮
- **语言选择器**：Auto / English / Chinese 三个按钮，Auto 为默认
- **条件隐藏**：summarize pipeline 时隐藏 Bilibili URL 和方向选择器
- **任务列表**：非 full pipeline 的任务显示 pipeline badge

### 任务详情页（tasks/[id]/page.tsx）

- **Pipeline badge**：概览区显示 pipeline 类型（不同颜色）
- **Summary 卡片**：summarize pipeline 成功后展示 Markdown 渲染的摘要，右上角 Copy Markdown 按钮
- **Rerun-from 按钮**：每个阶段行右侧有重跑按钮，弹出确认对话框
- **条件显示**：karaoke pipeline 不显示视频播放器

### Markdown 渲染

使用 `react-markdown` 组件，自定义 CSS 类 `.markdown-summary`（定义在 `globals.css`），包含 h2/h3/p/ul/ol/li/strong/blockquote/code 的样式。

---

## 新增依赖

### 前端

| 包 | 说明 |
|---|---|
| react-markdown | Markdown 渲染 |

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|---|---|---|
| 修改 | `backend/app/stages.py` | 新增 PipelineSpec + PIPELINES + summarize StageSpec |
| 修改 | `backend/app/sources.py` | 新增 source_with_language() |
| 修改 | `backend/app/pipeline.py` | 按 pipeline 运行、ASR fallback、summarize handler、source_with_language |
| 新增 | `backend/app/adapters/summarizer.py` | LLM 摘要生成，Markdown 输出 |
| 修改 | `backend/app/database.py` | pipeline/language 列、create_task 按 pipeline 创建阶段、reset_stages_from |
| 修改 | `backend/app/main.py` | pipeline/language API、rerun-from、summary artifact、pipelines 列表 |
| 修改 | `apps/web/src/lib/api.ts` | PipelineInfo/SummaryData 类型、createTask/uploadLocalTask 参数、listPipelines/getTaskSummary/rerunFromStage |
| 修改 | `apps/web/src/app/page.tsx` | Pipeline 卡片、语言选择器、pipeline badge |
| 修改 | `apps/web/src/app/tasks/[id]/page.tsx` | Pipeline badge、Markdown 摘要、Copy 按钮、rerun-from 按钮 |
| 修改 | `apps/web/src/app/globals.css` | .markdown-summary 样式 |
| 修改 | `apps/web/package.json` | react-markdown 依赖 |
