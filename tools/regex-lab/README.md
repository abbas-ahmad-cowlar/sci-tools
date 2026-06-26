# Regex Lab

A single-file, offline workbench for **reading, testing and understanding regular expressions**.

Open `index.html` in any modern browser — that's it. No build step, no install, no
server, no network calls. Everything runs locally in your browser and nothing is
ever sent anywhere.

## Why it exists

Most online regex tools test a pattern, but they don't really *explain* it. Regex Lab
was built to answer the question you actually have when you're staring at someone
else's `(?<=\$)\d{1,3}(?:,\d{3})*` — **"what on earth does this do?"** — and to let you
verify your own patterns at the same time.

## What it does

- **Live testing & highlighting** — type a pattern and your test text lights up with
  colour-coded matches as you go. Adjacent matches get different colours so you can
  tell them apart; zero-length matches (`\b`, `a*`) show as thin markers.
- **Plain-English explanation** — a hand-written regex parser turns your pattern into
  an AST and walks it to produce a nested, token-by-token description in real English
  ("named capture #1: a digit 0–9, repeated exactly 4 times…").
- **Railroad / syntax diagram** — the same AST is rendered as an SVG railroad diagram.
  Read it left to right; any path through the rails is a valid match. Groups, alternation,
  optionals, repetition loops and lookarounds all render distinctly.
- **Capture-group table** — every match with its numbered and **named** groups, and
  the offset where it was found.
- **Substitution preview** — try a replacement string (`$1`, `$<name>`, `$&`, …) and see
  the result update instantly.
- **Specimen library** — 16 ready-to-load, real-world patterns (email, URL, IPv4, ISO
  date, semver, UUID, strong-password lookaheads, backreference duplicate-word, …),
  each with sample text.
- **Token cheatsheet** — a compact, searchable reference of every regex construct.
- **Flags** — toggle `g i m s u y`; the explanation adapts (e.g. `^` becomes "start of a
  line" when `m` is on, `.` includes newlines when `s` is on).
- **Shareable state** — your pattern, flags, test text and replacement are encoded into
  the URL hash and saved to local storage. Hit **Share** to copy a link that reopens the
  exact session; **Copy** grabs the `/pattern/flags` literal.

## How it's built

One `index.html`. No dependencies. The interesting parts:

| Piece        | What it is |
|--------------|------------|
| **Parser**   | A recursive-descent parser for JavaScript regex syntax → AST (groups, named groups, lookarounds, classes, ranges, shorthands, quantifiers incl. lazy & `{n,m}`, anchors, backreferences, escapes). |
| **Explainer**| AST → nested English. Merges runs of literal characters, phrases quantifiers and lookarounds naturally, and reflects active flags. |
| **Railroad** | A small SVG layout engine. Each node measures itself and returns an entry/exit rail axis; sequences flow horizontally, alternations fan out with bezier rails, quantifiers draw bypass/loop paths. |
| **Tester**   | Uses the browser's own `RegExp` engine for matching/replacement, so behaviour is exactly what your JS code will see. |

Fonts (Martian Mono, JetBrains Mono, Familjen Grotesk) load from Google Fonts when
online and fall back to system mono/sans when offline.

## Notes & limits

- Matching uses the **JavaScript** regex engine. Other flavours (PCRE, .NET, Python)
  differ in some syntax (e.g. possessive quantifiers, atomic groups, recursion) which
  JS doesn't support and this tool therefore won't run.
- The parser supports the common JS syntax surface. Exotic Unicode property escapes
  (`\p{…}`) still *match* via the native engine but get a generic explanation.

## Running it

Just open the file:

```
# any of these work
start index.html          # Windows
open index.html           # macOS
xdg-open index.html       # Linux
```

Or serve the folder over HTTP if you prefer (`python -m http.server`).

---

Built with care as a self-contained tool. MIT-spirited — do whatever you like with it.
