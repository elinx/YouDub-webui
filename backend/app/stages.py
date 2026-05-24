from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StageSpec:
    name: str
    label: str


STAGES: tuple[StageSpec, ...] = (
    StageSpec("download", "Download"),
    StageSpec("separate", "Demucs"),
    StageSpec("asr", "Whisper"),
    StageSpec("asr_fix", "Split sentences"),
    StageSpec("translate", "Translate"),
    StageSpec("split_audio", "Split audio"),
    StageSpec("tts", "VoxCPM"),
    StageSpec("merge_audio", "Merge audio"),
    StageSpec("merge_video", "Merge video"),
    StageSpec("summarize", "Summarize"),
)


STAGE_NAMES = tuple(stage.name for stage in STAGES)


@dataclass(frozen=True)
class PipelineSpec:
    name: str
    label: str
    description: str
    stages: tuple[str, ...]


PIPELINES: dict[str, PipelineSpec] = {
    "full": PipelineSpec(
        name="full",
        label="Full Dubbing",
        description="EN→CN complete dubbed video",
        stages=("download", "separate", "asr", "asr_fix", "translate", "split_audio", "tts", "merge_audio", "merge_video"),
    ),
    "subtitles": PipelineSpec(
        name="subtitles",
        label="Subtitles",
        description="EN→CN bilingual subtitles, no dubbing",
        stages=("download", "separate", "asr", "asr_fix", "translate"),
    ),
    "summarize": PipelineSpec(
        name="summarize",
        label="Summarize",
        description="Video content summary",
        stages=("download", "asr", "summarize"),
    ),
    "karaoke": PipelineSpec(
        name="karaoke",
        label="Karaoke",
        description="Separate vocals and background music",
        stages=("download", "separate"),
    ),
}

