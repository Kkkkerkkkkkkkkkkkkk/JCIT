"""Synthesize one lesson's cached mp3 files with edge-tts.

Run from anywhere:

    python scripts/synthesize.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
LESSON_PATH = ROOT / "content" / "lessons" / "01.json"
AUDIO_DIR = ROOT / "public" / "audio" / "lesson-01"
PUNCTUATION = set(" \t\r\n。、，,.！？!?・…")


def tokenize(text: str, whitelist: list[str]) -> str | None:
    """Return the unmatched tail, or None when the line is fully allowed."""
    words = sorted(set(whitelist), key=len, reverse=True)
    remaining = "".join(ch for ch in text if ch not in PUNCTUATION)
    while remaining:
        match = next((word for word in words if remaining.startswith(word)), None)
        if match is None:
            return remaining
        remaining = remaining[len(match) :]
    return None


def load_lesson() -> dict:
    with LESSON_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def squash(text: str) -> str:
    return "".join(ch for ch in text if ch not in PUNCTUATION)


def part_reading(parts: list[dict]) -> str:
    return "".join(part.get("r") or part["t"] for part in parts)


def check_reading(label: str, parts: list[dict], whitelist: list[str], problems: list[str]) -> None:
    leftover = tokenize(part_reading(parts), whitelist)
    if leftover is not None:
        problems.append(f"{label}: not in whitelist 「{leftover}」")


def validate(lesson: dict) -> None:
    whitelist: list[str] = lesson["whitelist"]
    speakers: dict = lesson["speakers"]
    problems: list[str] = []
    for story in lesson["stories"]:
        for line in story["lines"]:
            if line["speaker"] not in speakers:
                problems.append(f"{line['id']}: unknown speaker {line['speaker']}")
            shown = squash(part_reading(line["parts"]))
            spoken = squash(line["speech"])
            if shown != spoken:
                problems.append(f"{line['id']}: ruby 「{shown}」 does not match speech 「{spoken}」")
            leftover = tokenize(line["speech"], whitelist)
            if leftover is not None:
                problems.append(f"{line['id']} speech: not in whitelist 「{leftover}」")
        for index, item in enumerate(story["grammar"], start=1):
            check_reading(f"{story['id']} grammar {index}", item["example"], whitelist, problems)
        for index, item in enumerate(story["words"], start=1):
            check_reading(f"{story['id']} word {index}", item["parts"], whitelist, problems)
    if problems:
        print("Lesson failed the grammar whitelist:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        raise SystemExit(1)


async def synthesize_line(line: dict, voice: str, rate: str) -> None:
    target = AUDIO_DIR / line["audio"]
    communicate = edge_tts.Communicate(line["speech"], voice, rate=rate)
    await communicate.save(str(target))
    print(f"wrote {target.relative_to(ROOT)}")


async def main() -> None:
    lesson = load_lesson()
    validate(lesson)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    rate = lesson.get("rate", "-5%")
    if "--check" in sys.argv:
        print("whitelist ok")
        return
    for story in lesson["stories"]:
        for line in story["lines"]:
            voice = lesson["speakers"][line["speaker"]]["voice"]
            await synthesize_line(line, voice, rate)


if __name__ == "__main__":
    asyncio.run(main())
