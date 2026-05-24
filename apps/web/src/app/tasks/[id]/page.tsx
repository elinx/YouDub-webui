"use client"

import { useRouter } from "next/navigation"
import { use, useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Download,
  FileText,
  Loader2,
  Play,
  RotateCw,
  Trash2,
  XCircle,
} from "lucide-react"

import {
  StageStatus,
  SummaryData,
  Task,
  deleteTask,
  finalVideoDownloadUrl,
  finalVideoUrl,
  getTask,
  getTaskLog,
  getTaskSummary,
  rerunFromStage,
  rerunTask,
  resumeTask,
} from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { statusBadgeClass } from "@/lib/status"
import { AppHeader } from "@/components/app-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from "react-markdown"

function stageIcon(status: StageStatus) {
  if (status === "succeeded") return <CheckCircle2 className="size-5 text-[#00aeec]" />
  if (status === "failed") return <XCircle className="size-5 text-[#ff0033]" />
  if (status === "running") return <Loader2 className="size-5 animate-spin text-[#fb7299]" />
  return <Circle className="size-5 text-muted-foreground" />
}

const pipelineBadgeColors: Record<string, string> = {
  full: "bg-[#00aeec]/15 text-[#00aeec] border-transparent",
  subtitles: "bg-purple-500/15 text-purple-600 border-transparent",
  summarize: "bg-emerald-500/15 text-emerald-600 border-transparent",
  karaoke: "bg-orange-500/15 text-orange-600 border-transparent",
}

function pipelineBadgeClass(name: string | null) {
  if (!name) return "bg-muted text-foreground border-border"
  return pipelineBadgeColors[name] || "bg-muted text-foreground border-border"
}

const pipelineLabels: Record<string, string> = {
  full: "Full Dubbing",
  subtitles: "Subtitles",
  summarize: "Summarize",
  karaoke: "Karaoke",
}

function formatTime(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function durationOf(start: string | null, end: string | null) {
  if (!start) return ""
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return ""
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return `${minutes}m${rem.toString().padStart(2, "0")}s`
}

function normalizeProgress(value: number | null | undefined) {
  if (typeof value !== "number") return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { stageLabel, statusLabel, t } = useI18n()
  const [task, setTask] = useState<Task | null>(null)
  const [log, setLog] = useState("")
  const [error, setError] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [rerunOpen, setRerunOpen] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [rerunError, setRerunError] = useState("")
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState("")
  const [rerunFromStageName, setRerunFromStageName] = useState<string | null>(null)
  const [rerunningFrom, setRerunningFrom] = useState(false)
  const [rerunFromError, setRerunFromError] = useState("")
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError("")
    try {
      await deleteTask(id)
      router.replace("/")
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t.task.deleteError)
      setDeleting(false)
    }
  }

  const handleRerun = async () => {
    setRerunning(true)
    setRerunError("")
    try {
      const next = await rerunTask(id)
      setRerunOpen(false)
      setTask(next)
      setLog("")
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : t.task.rerunError)
    } finally {
      setRerunning(false)
    }
  }

  const handleResume = async () => {
    setResuming(true)
    setResumeError("")
    try {
      const next = await resumeTask(id)
      setTask(next)
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : t.task.resumeError)
    } finally {
      setResuming(false)
    }
  }

  const handleRerunFrom = async () => {
    if (!rerunFromStageName) return
    setRerunningFrom(true)
    setRerunFromError("")
    try {
      const next = await rerunFromStage(id, rerunFromStageName)
      setRerunFromStageName(null)
      setTask(next)
      setLog("")
    } catch (err) {
      setRerunFromError(err instanceof Error ? err.message : "Failed to rerun from stage")
    } finally {
      setRerunningFrom(false)
    }
  }

  const isRunning = task?.status === "running"
  const isFailed = task?.status === "failed"

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await getTask(id)
        if (cancelled) return
        setTask(next)
        const logText = await getTaskLog(id)
        if (cancelled) return
        setLog(logText)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t.task.loadError)
      }
    }
    load()
    const interval = window.setInterval(load, 2000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [id, t.task.loadError])

  useEffect(() => {
    if (task?.status !== "succeeded" || task.pipeline !== "summarize") return
    let cancelled = false
    getTaskSummary(task.id)
      .then((data) => {
        if (!cancelled) setSummaryData(data)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [task?.status, task?.pipeline, task?.id])

  const progress = useMemo(() => {
    if (!task?.stages?.length) return 0
    const completed = task.stages.filter((stage) => stage.status === "succeeded").length
    return Math.round((completed / task.stages.length) * 100)
  }, [task])

  if (error && !task) {
    return (
      <main className="min-h-screen bg-[linear-gradient(135deg,#fff5f5_0%,#f2fbff_48%,#fff4fa_100%)] text-foreground">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <AppHeader backHref="/" />
          <Card>
            <CardContent className="px-6 py-10 text-sm text-red-600">{error}</CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff5f5_0%,#f2fbff_48%,#fff4fa_100%)] text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <AppHeader backHref="/" />

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>{t.task.overview}</CardTitle>
              <div className="flex items-center gap-2">
                {task?.pipeline ? (
                  <Badge className={pipelineBadgeClass(task.pipeline)}>{pipelineLabels[task.pipeline] || task.pipeline}</Badge>
                ) : null}
                <Badge className={statusBadgeClass(task?.status)}>{statusLabel(task?.status)}</Badge>
              </div>
            </div>
            <Progress value={progress} />
          </CardHeader>
          <CardContent>
            {task ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[120px_1fr]">
                {task.title ? (
                  <>
                    <dt className="text-muted-foreground">{t.task.title}</dt>
                    <dd className="break-words font-medium">{task.title}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">URL</dt>
                <dd className="break-all">
                  <a href={task.url} target="_blank" rel="noreferrer" className="text-[#00aeec] hover:underline">
                    {task.url}
                  </a>
                </dd>
                <dt className="text-muted-foreground">{t.task.taskId}</dt>
                <dd className="font-mono text-xs">{task.id}</dd>
                <dt className="text-muted-foreground">{t.task.created}</dt>
                <dd>{formatTime(task.created_at)}</dd>
                <dt className="text-muted-foreground">{t.task.started}</dt>
                <dd>{formatTime(task.started_at)}</dd>
                <dt className="text-muted-foreground">{t.task.completed}</dt>
                <dd>{formatTime(task.completed_at) || "—"}</dd>
                {task.session_path ? (
                  <>
                    <dt className="text-muted-foreground">{t.task.session}</dt>
                    <dd className="break-all text-xs text-muted-foreground">{task.session_path}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">{t.task.loading}</div>
            )}
          </CardContent>
        </Card>

        {task?.status === "succeeded" && task.pipeline === "summarize" && summaryData ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Summary</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(summaryData.summary_markdown)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  <Copy className="size-3.5" />
                  {copied ? "Copied" : "Copy Markdown"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <article className="markdown-summary">
                <ReactMarkdown>{summaryData.summary_markdown}</ReactMarkdown>
              </article>
              <div>
                <button
                  type="button"
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                  className="flex items-center gap-1 text-xs font-medium text-[#00aeec] hover:underline"
                >
                  {summaryExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  {summaryExpanded ? "Hide full text" : "Show full text"}
                </button>
                {summaryExpanded ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {summaryData.full_text}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {task?.status === "succeeded" && task.final_video_path && task.pipeline !== "karaoke" ? (
          <Card>
            <CardHeader>
              <CardTitle>{t.task.finalVideo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <video
                key={task.id}
                src={finalVideoUrl(task.id)}
                controls
                preload="metadata"
                className="w-full rounded-md border border-emerald-200 bg-black"
              />
              <p className="break-all text-xs text-muted-foreground">{task.final_video_path}</p>
              <Button nativeButton={false} render={<a href={finalVideoDownloadUrl(task.id)} />}>
                <Download className="size-4" />
                {t.task.download}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t.task.stages}</CardTitle>
          </CardHeader>
          <CardContent>
            {task ? (
              <ol className="grid gap-3">
                {task.stages.map((stage, index) => {
                  const stageProgress = normalizeProgress(stage.progress)
                  return (
                    <li
                      key={stage.name}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3"
                    >
                      <div className="mt-0.5">{stageIcon(stage.status)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">#{index + 1}</span>
                          <p className="font-medium">{stageLabel(stage.name, stage.label)}</p>
                          <Badge className={statusBadgeClass(stage.status)}>{statusLabel(stage.status)}</Badge>
                          {stage.started_at ? (
                            <span className="text-xs text-muted-foreground">
                              {durationOf(stage.started_at, stage.completed_at)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {stage.error_message || stage.last_message || t.common.waiting}
                        </p>
                        {stage.status === "running" && stageProgress !== null ? (
                          <div className="mt-2 flex items-center gap-3">
                            <Progress value={stageProgress} className="min-w-0 flex-1" />
                            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                              {stageProgress}%
                            </span>
                          </div>
                        ) : null}
                        {!isRunning && (stage.status === "succeeded" || stage.status === "failed") ? (
                          <button
                            type="button"
                            onClick={() => setRerunFromStageName(stage.name)}
                            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
                            title={`Rerun from ${stageLabel(stage.name, stage.label)}`}
                          >
                            <RotateCw className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : null}

            {task?.error_message ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {task.error_message}
              </div>
            ) : null}
            {isFailed ? (
              <div className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-800">
                  {t.task.resumeHelp}
                </p>
                <Button onClick={handleResume} disabled={resuming}>
                  {resuming ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  {resuming ? t.task.resuming : t.task.resumeTask}
                </Button>
              </div>
            ) : null}
            {resumeError ? (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {resumeError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t.task.runLog}</CardTitle>
            <FileText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80 rounded-lg border bg-zinc-950 p-3 text-xs text-zinc-100">
              {log ? (
                <pre className="whitespace-pre-wrap break-words font-mono">{log}</pre>
              ) : (
                <p className="text-zinc-400">{t.task.emptyLog}</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">{t.task.dangerZone}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t.task.rerunHelp}
              </p>
              <Dialog open={rerunOpen} onOpenChange={setRerunOpen}>
                <DialogTrigger
                  render={
                    <Button variant="outline" disabled={!task || isRunning}>
                      <RotateCw className="size-4" />
                      {t.task.rerunTask}
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t.task.rerunTitle}</DialogTitle>
                    <DialogDescription>
                      {t.task.rerunDescription}
                    </DialogDescription>
                  </DialogHeader>
                  {rerunError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {rerunError}
                    </div>
                  ) : null}
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" disabled={rerunning} />}>
                      {t.common.cancel}
                    </DialogClose>
                    <Button onClick={handleRerun} disabled={rerunning}>
                      {rerunning ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
                      {rerunning ? t.task.rerunning : t.task.confirmRerun}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Dialog open={rerunFromStageName !== null} onOpenChange={(open) => { if (!open) setRerunFromStageName(null) }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Rerun from {rerunFromStageName ? stageLabel(rerunFromStageName, task?.stages.find(s => s.name === rerunFromStageName)?.label || rerunFromStageName) : ""}</DialogTitle>
                  <DialogDescription>
                    This will re-run from {rerunFromStageName ? stageLabel(rerunFromStageName, task?.stages.find(s => s.name === rerunFromStageName)?.label || rerunFromStageName) : ""} onwards. Earlier completed stages will reuse their cached results.
                  </DialogDescription>
                </DialogHeader>
                {rerunFromError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {rerunFromError}
                  </div>
                ) : null}
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" disabled={rerunningFrom} />}>
                    {t.common.cancel}
                  </DialogClose>
                  <Button onClick={handleRerunFrom} disabled={rerunningFrom}>
                    {rerunningFrom ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
                    {rerunningFrom ? "Rerunning…" : "Rerun from here"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t.task.deleteHelp} <code className="font-mono text-xs">workfolder/</code>
                {t.common.sentenceEnd}
              </p>
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger
                  render={
                    <Button variant="destructive" disabled={!task || isRunning}>
                      <Trash2 className="size-4" />
                      {t.task.deleteTask}
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t.task.deleteTitle}</DialogTitle>
                    <DialogDescription>
                      {t.task.deleteDescription}
                    </DialogDescription>
                  </DialogHeader>
                  {deleteError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {deleteError}
                    </div>
                  ) : null}
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" disabled={deleting} />}>
                      {t.common.cancel}
                    </DialogClose>
                    <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                      {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      {deleting ? t.task.deleting : t.task.confirmDelete}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {isRunning ? (
              <p className="text-xs text-amber-600">{t.task.runningLocked}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
