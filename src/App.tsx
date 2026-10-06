import { useRef, useState } from "react";
import course from "../content/course.json";
import lesson01 from "../content/lessons/01.json";
import lesson02 from "../content/lessons/02.json";
import lesson03 from "../content/lessons/03.json";
import lesson04 from "../content/lessons/04.json";
import lesson05 from "../content/lessons/05.json";

const lessons = [lesson01, lesson02, lesson03, lesson04, lesson05];
const readyIds = new Set(lessons.map((item) => item.id));
type Part = { t: string; r?: string };

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M3 1.5v9l7.5-4.5L3 1.5z" fill="currentColor" />
    </svg>
  );
}

function Furigana({ parts }: { parts: readonly Part[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.r ? (
          <ruby
            key={index}
            style={{ minWidth: `${Math.max(part.t.length, part.r.length * 0.52)}em` }}
          >
            <span className="rb">{part.t}</span>
            <rt>{part.r}</rt>
          </ruby>
        ) : (
          <span key={index}>{part.t}</span>
        ),
      )}
    </>
  );
}

export default function App() {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "all" | "one">("idle");
  const [missingId, setMissingId] = useState<string | null>(null);
  const run = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lineRefs = useRef<Record<string, HTMLElement | null>>({});
  const lesson = lessons[lessonIndex];
  const story = lesson.stories[storyIndex];
  const catalog = course.units
    .flatMap((unit) => unit.lessons.map((item) => ({ ...item, unitLabel: unit.label })))
    .find((item) => item.id === lesson.id);

  function audioElement() {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }

  function stop() {
    run.current += 1;
    audioRef.current?.pause();
    setActiveId(null);
    setMode("idle");
  }

  function selectStory(index: number) {
    stop();
    setStoryIndex(index);
    setOpenId(null);
    setMissingId(null);
  }

  function selectLesson(id: string) {
    const index = lessons.findIndex((item) => item.id === id);
    if (index < 0) return;
    stop();
    setLessonIndex(index);
    setStoryIndex(0);
    setOpenId(null);
    setMissingId(null);
  }

  function playFile(src: string, token: number) {
    const element = audioElement();
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        element.onended = null;
        element.onerror = null;
        element.onpause = null;
        resolve(ok);
      };
      element.onended = () => finish(true);
      element.onerror = () => finish(false);
      element.onpause = () => {
        if (run.current !== token) finish(false);
      };
      element.src = src;
      void element.play().catch(() => finish(false));
    });
  }

  async function wait(ms: number, token: number) {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
    return run.current === token;
  }

  async function playFrom(index: number, all: boolean) {
    const token = ++run.current;
    const lines = story.lines;
    audioRef.current?.pause();
    setMode(all ? "all" : "one");
    setMissingId(null);

    for (let i = index; i < lines.length; i += 1) {
      if (run.current !== token) return;
      const line = lines[i];
      setActiveId(line.id);
      lineRefs.current[line.id]?.scrollIntoView({ block: "nearest" });
      const ok = await playFile(`/audio/lesson-${lesson.id}/${line.audio}`, token);
      if (run.current !== token) return;
      if (!ok) {
        setMissingId(line.id);
        break;
      }
      if (!all) break;
      const still = await wait(lesson.pauseMs, token);
      if (!still) return;
    }

    if (run.current === token) {
      setActiveId(null);
      setMode("idle");
    }
  }

  return (
    <div className="app">
      <nav className="sidebar" aria-label="课程">
        <p className="sidebar-course">{course.course}</p>
        {course.units.map((unit) => (
          <section key={unit.id} className="unit" aria-label={unit.label}>
            <p className="unit-label">{unit.label}</p>
            <ul className="unit-lessons">
              {unit.lessons.map((item) => {
                const ready = readyIds.has(item.id);
                const current = item.id === lesson.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="nav-lesson"
                      aria-current={current ? "page" : undefined}
                      disabled={!ready}
                      onClick={() => selectLesson(item.id)}
                    >
                      <span className="nav-no">第{item.lesson}课</span>
                      <span className="nav-title" lang="ja">
                        <Furigana parts={item.bookTitle} />
                      </span>
                      {ready ? null : <span className="nav-soon">还没写</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
      <main className="paper">
      <p className="eyebrow">
        {course.course} / {catalog?.unitLabel} / 第{lesson.lesson}课
      </p>
      <h1 className="book-title" lang="ja">
        <Furigana parts={catalog?.bookTitle ?? []} />
      </h1>
      <div
        role="tabpanel"
        id={`story-panel-${lesson.id}-${story.id}`}
        aria-labelledby={`story-tab-${lesson.id}-${story.id}`}
      >
        <h2 className="story-heading">{story.title}</h2>
        <p className="scene">{story.scene}</p>
        <p className="hint">点句子可以看这句中文。注音标在汉字上面。</p>
        <div className="controls">
          <button type="button" className="primary" onClick={() => void playFrom(0, true)}>
            听这则
          </button>
          <button type="button" className="secondary" onClick={stop} disabled={mode === "idle"}>
            停止
          </button>
        </div>
        <div className="lines">
          {story.lines.map((line, index) => {
            const speaker = lesson.speakers[line.speaker as keyof typeof lesson.speakers];
            const open = openId === line.id;
            const active = activeId === line.id;
            return (
              <article
                key={line.id}
                className={active ? "line is-active" : "line"}
                aria-current={active ? "true" : undefined}
                ref={(node) => {
                  lineRefs.current[line.id] = node;
                }}
              >
                <span className="lamp" aria-hidden="true" />
                <p className={line.speaker === "周" ? "who zhou" : "who sato"}>
                  <ruby style={{ minWidth: `${Math.max(line.speaker.length, speaker.reading.length * 0.52)}em` }}>
                    <span className="rb">{line.speaker}</span>
                    <rt>{speaker.reading}</rt>
                  </ruby>
                </p>
                <div className="utterance">
                  <button
                    type="button"
                    className="jp"
                    lang="ja"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : line.id)}
                  >
                    <Furigana parts={line.parts} />
                  </button>
                  {open ? <p className="zh">{line.zh}</p> : null}
                  {missingId === line.id ? (
                    <p className="missing" role="status">
                      这句还没有声音。先运行 python scripts/synthesize.py。
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="play"
                  aria-label={`听${line.speaker}这句`}
                  aria-pressed={active}
                  onClick={() => {
                    if (active && mode === "one") stop();
                    else void playFrom(index, false);
                  }}
                >
                  <PlayIcon />
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </main>
      <aside className="dossier">
        <div className="dossier-main">
          <p className="dossier-kicker">STORY</p>
          <div className="pager" role="tablist" aria-label="这一课的故事">
            {lesson.stories.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`story-tab-${lesson.id}-${item.id}`}
                aria-selected={index === storyIndex}
                aria-controls={`story-panel-${lesson.id}-${item.id}`}
                onClick={() => selectStory(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
        <section className="notes" aria-label="本则整理">
          <h2>本则整理</h2>
          <h3>语法</h3>
          <ul className="grammar">
            {story.grammar.map((item) => (
              <li key={item.pattern}>
                <p className="pattern" lang="ja">
                  {item.pattern}
                </p>
                <p className="note-zh">{item.zh}</p>
                <p className="example" lang="ja">
                  <Furigana parts={item.example} />
                </p>
              </li>
            ))}
          </ul>
          <h3>单词</h3>
          <ul className="words">
            {story.words.map((word) => (
              <li key={word.zh}>
                <span className="word" lang="ja">
                  <Furigana parts={word.parts} />
                </span>
                <span className="note-zh">{word.zh}</span>
              </li>
            ))}
          </ul>
        </section>
        </div>
        <p className="vert-index">
          {catalog?.unitLabel} 第{lesson.lesson}课 {story.label}
        </p>
      </aside>
    </div>
  );
}
