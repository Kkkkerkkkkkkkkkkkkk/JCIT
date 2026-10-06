"""Synthesize cached mp3 files for every lesson with edge-tts.

Run from anywhere:

    python scripts/synthesize.py --check
    python scripts/synthesize.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
LESSON_DIR = ROOT / "content" / "lessons"
PUNCTUATION = set(" \t\r\n。、，,.！？!?・…")


def tokenize(text: str, whitelist: list[str]) -> str | None:
    """Return the unmatched tail, or None when the line is fully allowed.

    Longer words are tried first, then shorter ones, so はい does not swallow
    the は in はいます.
    """
    words = sorted(set(whitelist), key=len, reverse=True)
    remaining = "".join(ch for ch in text if ch not in PUNCTUATION)
    furthest = 0
    seen: dict[int, bool] = {}

    def covers(index: int) -> bool:
        nonlocal furthest
        if index > furthest:
            furthest = index
        if index in seen:
            return seen[index]
        if index == len(remaining):
            seen[index] = True
            return True
        ok = False
        for word in words:
            nxt = index + len(word)
            if remaining.startswith(word, index) and covers(nxt):
                ok = True
                break
        seen[index] = ok
        return ok

    if covers(0):
        return None
    return remaining[furthest:]


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
        print(f"Lesson {lesson['id']} failed the grammar whitelist:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        raise SystemExit(1)


def load_lessons() -> list[dict]:
    lessons = []
    for path in sorted(LESSON_DIR.glob("*.json")):
        with path.open(encoding="utf-8") as handle:
            lessons.append(json.load(handle))
    return lessons


async def synthesize_line(line: dict, voice: str, rate: str, audio_dir: Path) -> None:
    target = audio_dir / line["audio"]
    if target.exists() and "--force" not in sys.argv:
        print(f"keep {target.relative_to(ROOT)}")
        return
    communicate = edge_tts.Communicate(line["speech"], voice, rate=rate)
    await communicate.save(str(target))
    print(f"wrote {target.relative_to(ROOT)}")


async def synthesize_lesson(lesson: dict) -> None:
    audio_dir = ROOT / "public" / "audio" / f"lesson-{lesson['id']}"
    audio_dir.mkdir(parents=True, exist_ok=True)
    rate = lesson.get("rate", "-5%")
    semaphore = asyncio.Semaphore(4)

    async def one(line: dict) -> None:
        async with semaphore:
            voice = lesson["speakers"][line["speaker"]]["voice"]
            await synthesize_line(line, voice, rate, audio_dir)

    lines = [line for story in lesson["stories"] for line in story["lines"]]
    await asyncio.gather(*(one(line) for line in lines))


async def main() -> None:
    lessons = load_lessons()
    for lesson in lessons:
        validate(lesson)
    if "--check" in sys.argv:
        print(f"whitelist ok ({len(lessons)} lessons)")
        return
    for lesson in lessons:
        await synthesize_lesson(lesson)


if __name__ == "__main__":
    asyncio.run(main())
