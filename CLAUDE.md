# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Lumen — a single-page luxury calculator web app. Three static files, no build step, no dependencies, no package.json. Designed to run by opening `index.html` directly or serving the directory.

## Running locally

```bash
python3 -m http.server 8000    # then open http://localhost:8000/
```

Or just open `index.html` in a browser. There is no test runner, linter, or build pipeline configured.

## Architecture

All logic lives in `app.js`, wrapped in a single IIFE with a shared `state` object (`expression`, `result`, `justEvaluated`, `mode`, `history`, `historyOpen`). Three concerns are interleaved inside that IIFE:

1. **Math engine** — a tokenizer → shunting-yard (`toRPN`) → RPN evaluator pipeline. Custom because the calculator must support unary minus, function calls (`sin`, `ln`, `fact`, …), constants (`π`, `e`), right-associative `^`, and live partial evaluation. Display strings use unicode operators (`×`, `÷`, `−`); `tokenize` normalizes them back to ASCII before parsing. **Do not replace this with `eval()`** — the input contains unicode and constants that aren't valid JS.

2. **Input + render layer** — `input(action, payload)` is the single mutation entry point used by both the click handler (`keysEl` delegated) and the keyboard handler (`document` keydown). After every input it calls `liveEval()` (silently re-evaluates the current expression so the result display updates as you type) and then `render()`. The `justEvaluated` flag controls whether the next digit clears the expression or appends to it.

3. **UI subsystems** — mode switching (`setMode` also repositions the sliding `.mode-indicator` pill and toggles `data-mode` on the calculator card, which CSS uses to expand/collapse the `.sci-keys` row), history (localStorage key `lumen.history`, capped at 50 entries), converter (static `CONV_DATA` table; temperature has its own `convertTemp` because it isn't a simple ratio), ripple/haptic feedback (`attachRipple` injects a span and calls `navigator.vibrate`), and a toast.

The HTML has two key containers — `.sci-keys` (5-col grid, hidden in basic mode via max-height transition) and `.main-keys` (4-col grid, always visible). When adding keys, put scientific functions in `.sci-keys` and basic operators/digits in `.main-keys` so the grid layouts stay consistent.

Styling is in `styles.css` with CSS custom properties at `:root` for the neon palette, glass tokens, radii, shadows, and easings. Reuse these vars rather than hardcoding colors.

## Git workflow

Active development branch is `claude/stoic-fermi-a2oVZ`. Push with `git push -u origin <branch>`.
