# LearnOS V1

A source-first research and learning interface. Search a topic, paste a URL, or paste a transcript. LearnOS gathers real sources, extracts the useful parts, and renders them as a focused, readable guide with evidence one tap away.

## Run locally

```bash
python server.py
```

Open `http://localhost:8765`.

## What works now

- Topic search via DuckDuckGo HTML results, followed by source extraction.
- URL mode with focused page extraction or same-site crawl.
- Pasted text/transcript ingestion.
- Source ranking and passage scoring based on the user's topic.
- Reader UI with Guide, Evidence, Sources, and Map views.
- Local research history and saved items.
- Responsive mobile-first interface and dark mode.
- SSRF protections, robots.txt checks, response-size limits, timeouts, redirect validation, and per-IP rate limiting.

## Architecture rule

The UI never treats model prose as a source. The current V1 deliberately produces source-backed extraction instead of AI-authored filler. A later synthesis model can be added only after retrieval and must cite source IDs for every substantive section.

## Deploying

This app needs a server because browsers cannot reliably scrape arbitrary sites due to CORS and security restrictions. GitHub can store the code, but the Python server should run on a small host (Render, Railway, Fly.io, VPS, etc.). The frontend is plain HTML/CSS/JS and can later be moved to GitHub Pages while the `/api/research` endpoint runs separately.
