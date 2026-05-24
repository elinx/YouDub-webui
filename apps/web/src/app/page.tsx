"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react"
import { ChevronRight, FileText, Mic, Music, Play, Upload } from "lucide-react"

import {
  PipelineInfo,
  TaskSummary,
  LocalDirection,
  createTask,
  listPipelines,
  listTasks,
  uploadLocalTask,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function isActive(status: string) {
  return status === "queued" || status === "running"
}

function pipelineIcon(name: string) {
  if (name === "full") return <Mic className="size-4" />
  if (name === "subtitles") return <FileText className="size-4" />
  if (name === "summarize") return <FileText className="size-4" />
  if (name === "karaoke") return <Music className="size-4" />
  return <Play className="size-4" />
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

function formatTime(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function shortUrl(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "")
}

function activeCount(tasks: TaskSummary[]) {
  return tasks.filter((t) => isActive(t.status)).length
}

export default function Home() {
  const router = useRouter()
  const { activeTasksText, stageLabel, statusLabel, t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [bilibiliUrl, setBilibiliUrl] = useState("")
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [localDirection, setLocalDirection] = useState<LocalDirection>("en-zh")
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState("full")
  const [selectedLanguage, setSelectedLanguage] = useState<string>("auto")
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function refreshTasks() {
    const { tasks: list } = await listTasks()
    setTasks(list)
  }

  useEffect(() => {
    let cancelled = false

    const loadTasks = async () => {
      try {
        const { tasks: list } = await listTasks()
        if (!cancelled) setTasks(list)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t.home.loadError)
      }
    }

    loadTasks()
    const interval = window.setInterval(loadTasks, 2000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [t.home.loadError])

  useEffect(() => {
    listPipelines()
      .then(({ pipelines: list }) => setPipelines(list))
      .catch(() => undefined)
  }, [])

  function selectLocalFile(event: ChangeEvent<HTMLInputElement>) {
    setError("")
    setLocalFile(event.target.files?.[0] || null)
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    const submittedUrl = youtubeUrl.trim() || bilibiliUrl.trim()
    if (!submittedUrl && !localFile) return
    setSubmitting(true)
    try {
      const created = localFile
        ? await uploadLocalTask(localFile, localDirection, selectedPipeline, selectedLanguage)
        : await createTask(submittedUrl, selectedPipeline, selectedLanguage)
      setYoutubeUrl("")
      setBilibiliUrl("")
      setLocalFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      refreshTasks().catch(() => undefined)
      router.push(`/tasks/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.home.createError)
    } finally {
      setSubmitting(false)
    }
  }

  const queued = activeCount(tasks)
  const hasUrl = Boolean(youtubeUrl.trim() || bilibiliUrl.trim())
  const hasLocalFile = Boolean(localFile)
  const canSubmit = Boolean((hasUrl || hasLocalFile) && !submitting)

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff5f5_0%,#f2fbff_48%,#fff4fa_100%)] text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <AppHeader />

        <Card>
          <CardHeader>
            <CardTitle>{t.home.createTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitTask} className="space-y-4">
              <div className="space-y-2">
                <Label>Pipeline</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {pipelines.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setSelectedPipeline(p.name)}
                      className={`flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2.5 text-center transition-all ${
                        selectedPipeline === p.name
                          ? "border-[#00aeec] bg-[#00aeec]/5 shadow-sm"
                          : "border-border bg-background hover:border-[#00aeec]/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className={`${selectedPipeline === p.name ? "text-[#00aeec]" : "text-muted-foreground"}`}>
                        {pipelineIcon(p.name)}
                      </div>
                      <span className="text-xs font-medium leading-tight">{p.label}</span>
                      <span className="text-[10px] leading-tight text-muted-foreground">
                        {p.stages.length} step{p.stages.length !== 1 ? "s" : ""}
                      </span>
                    </button>
                  ))}
                </div>
                {pipelines.length > 0 && selectedPipeline ? (
                  <p className="text-xs text-muted-foreground">
                    {pipelines.find((p) => p.name === selectedPipeline)?.description}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Video language</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage("auto")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedLanguage === "auto"
                        ? "border-[#00aeec] bg-[#00aeec]/10 text-[#00aeec]"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage("en")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedLanguage === "en"
                        ? "border-[#00aeec] bg-[#00aeec]/10 text-[#00aeec]"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage("zh")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedLanguage === "zh"
                        ? "border-[#00aeec] bg-[#00aeec]/10 text-[#00aeec]"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    Chinese
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedLanguage === "auto"
                    ? "Language detected automatically from URL"
                    : `Override: ASR will use ${selectedLanguage === "en" ? "English" : "Chinese"}`}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="youtube-url">{t.home.youtubeLabel}</Label>
                <Input
                  id="youtube-url"
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={Boolean(bilibiliUrl.trim()) || hasLocalFile}
                />
              </div>
              {selectedPipeline === "summarize" ? null : (
                <div className="space-y-2">
                  <Label htmlFor="bilibili-url">{t.home.bilibiliLabel}</Label>
                  <Input
                    id="bilibili-url"
                    value={bilibiliUrl}
                    onChange={(event) => setBilibiliUrl(event.target.value)}
                    placeholder="https://www.bilibili.com/video/BV..."
                    disabled={Boolean(youtubeUrl.trim()) || hasLocalFile}
                  />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <div className="space-y-2">
                  <Label htmlFor="local-video">{t.home.localVideoLabel}</Label>
                  <Input
                    ref={fileInputRef}
                    id="local-video"
                    type="file"
                    accept="video/*,.mp4,.mov,.m4v,.mkv,.webm,.avi,.flv,.wmv"
                    onChange={selectLocalFile}
                    disabled={hasUrl}
                  />
                </div>
                {selectedPipeline === "summarize" ? null : (
                  <div className="space-y-2">
                    <Label htmlFor="local-direction">{t.home.localDirectionLabel}</Label>
                    <Select
                      value={localDirection}
                      onValueChange={(value) => setLocalDirection(value as LocalDirection)}
                      disabled={hasUrl}
                    >
                      <SelectTrigger id="local-direction" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en-zh">{t.home.localEnZh}</SelectItem>
                        <SelectItem value="zh-en">{t.home.localZhEn}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                {queued > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {activeTasksText(queued)}
                  </p>
                ) : (
                  <span />
                )}
                <Button type="submit" disabled={!canSubmit}>
                  {hasLocalFile ? <Upload className="size-4" /> : <Play className="size-4" />}
                  {submitting ? t.home.submitting : t.home.createTask}
                </Button>
              </div>
            </form>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.home.taskHistory} ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {tasks.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                {t.home.empty}
              </div>
            ) : (
              <ScrollArea className="max-h-[70dvh]">
                <ul className="flex flex-col">
                  {tasks.map((item) => (
                    <li key={item.id} className="border-b border-border/60 last:border-b-0">
                      <Link
                        href={`/tasks/${item.id}`}
                        className="flex w-full items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-left font-medium text-zinc-900">
                            {item.title || shortUrl(item.url)}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge className={statusBadgeClass(item.status)}>{statusLabel(item.status)}</Badge>
                            {item.pipeline && item.pipeline !== "full" ? (
                              <Badge className={pipelineBadgeClass(item.pipeline)}>{item.pipeline}</Badge>
                            ) : null}
                            <span>{formatTime(item.created_at)}</span>
                            {isActive(item.status) && item.current_stage ? (
                              <span>· {stageLabel(item.current_stage)}</span>
                            ) : null}
                          </div>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
