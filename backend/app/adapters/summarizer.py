from __future__ import annotations

import json
from pathlib import Path

from openai import OpenAI

from ..sources import SourceConfig
from .openai_client import normalize_openai_base_url


def summarize_asr(
    asr_file: Path,
    session: Path,
    settings: dict[str, str],
    source: SourceConfig,
) -> Path:
    output_file = session / "metadata" / "summary.json"
    if output_file.exists():
        return output_file

    data = json.loads(asr_file.read_text(encoding="utf-8"))
    utterances = data.get("result", {}).get("utterances", [])
    full_text = data.get("result", {}).get("text", "")
    if not full_text.strip():
        full_text = " ".join(u.get("text", "") for u in utterances)

    base_url = normalize_openai_base_url(settings.get("base_url", ""))
    api_key = settings.get("api_key", "")
    model = settings.get("model", "")

    client = OpenAI(api_key=api_key, base_url=base_url)

    system_prompt = (
        "你是一个专业的内容分析师。请仔细阅读以下视频转录文本，深度理解其核心内容和逻辑，然后用中文输出 Markdown 格式的总结。\n\n"
        "格式要求：\n"
        "## 概述\n"
        "用3-5句话概括视频的核心主题、立场和主要结论。不要泛泛而谈，要抓住作者真正想表达的东西。\n\n"
        "## 核心要点\n"
        "提取5-10个关键要点，按重要性排序。每个要点用1-2句话说明，要有信息量，不是空洞的标题。"
        "如果内容有明确的论证逻辑，保留逻辑链条。\n\n"
        "## 关键细节\n"
        "列出2-5个值得注意的具体细节、数据或案例。如无则省略此节。\n\n"
        "## 总结\n"
        "总结核心观点和可能的启示或影响，2-3句话。\n\n"
        "直接输出 Markdown 内容，不要用代码块包裹。所有内容用中文。"
    )

    user_prompt = f"Video transcript ({source.asr_language_name}):\n\n{full_text}"

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )

    markdown_content = (response.choices[0].message.content or "").strip()

    payload = {
        "source_language": source.asr_language,
        "summary_markdown": markdown_content,
        "full_text": full_text,
    }
    output_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_file
