from __future__ import annotations

import html
import ipaddress
import json
import re
import socket
import threading
import time
import os
import urllib.parse
import urllib.robotparser
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
STATIC = ROOT / "static"
HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", "8765"))
USER_AGENT = "LearnOSResearchBot/0.1 (+source-first educational research)"
MAX_BYTES = 1_600_000
TIMEOUT = 10
RATE_WINDOW = 15 * 60
RATE_MAX = 20
RATE = defaultdict(deque)
RATE_LOCK = threading.Lock()

STOP = {
    "the","a","an","and","or","of","to","in","for","on","with","is","are","was","were","be","as","at","by","from","it","this","that","these","those","how","what","why","when","where","who","about","learn","understand","everything","guide"
}


def json_response(handler, payload, status=200):
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(raw)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(raw)


def is_public_host(hostname: str) -> bool:
    if not hostname:
        return False
    h = hostname.lower().strip(".")
    if h in {"localhost", "localhost.localdomain"} or h.endswith(".local"):
        return False
    try:
        infos = socket.getaddrinfo(h, None)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False
    return True


def validate_url(url: str) -> str:
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    p = urllib.parse.urlsplit(url)
    if p.scheme not in {"http", "https"} or not p.hostname or not is_public_host(p.hostname):
        raise ValueError("Only public http/https URLs are allowed.")
    return urllib.parse.urlunsplit((p.scheme, p.netloc, p.path or "/", p.query, ""))


def allowed_by_robots(url: str) -> bool:
    try:
        p = urllib.parse.urlsplit(url)
        robots_url = f"{p.scheme}://{p.netloc}/robots.txt"
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        return True


def safe_get(url: str):
    url = validate_url(url)
    current = url
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.5,*/*;q=0.1",
        "Accept-Language": "en-US,en;q=0.8",
    }
    for _ in range(5):
        if not allowed_by_robots(current):
            raise ValueError("This page disallows automated access in robots.txt.")
        r = requests.get(current, headers=headers, timeout=TIMEOUT, allow_redirects=False, stream=True)
        if r.status_code in {301,302,303,307,308}:
            loc = r.headers.get("Location")
            if not loc:
                break
            current = validate_url(urllib.parse.urljoin(current, loc))
            continue
        if r.status_code >= 400:
            raise ValueError(f"Source returned HTTP {r.status_code}.")
        ctype = (r.headers.get("Content-Type") or "").lower()
        if "text/html" not in ctype and "application/xhtml+xml" not in ctype and "text/plain" not in ctype:
            raise ValueError("This V1 currently extracts HTML and plain-text pages.")
        chunks, total = [], 0
        for chunk in r.iter_content(32768):
            total += len(chunk)
            if total > MAX_BYTES:
                raise ValueError("Page is too large to process safely.")
            chunks.append(chunk)
        enc = r.encoding or "utf-8"
        return b"".join(chunks).decode(enc, errors="replace"), current
    raise ValueError("Too many redirects.")


def clean_text(s: str) -> str:
    s = html.unescape(s or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def keywords(topic: str):
    toks = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9+.-]{1,}", topic.lower())
    return [t for t in toks if t not in STOP][:20]


def score_text(text: str, kws):
    low = text.lower()
    score = 0.0
    for kw in kws:
        n = low.count(kw)
        if n:
            score += min(n, 6) * (2.5 if " " not in kw else 4)
    L = len(text)
    if 120 <= L <= 1600:
        score += 2
    elif 60 <= L < 120:
        score += 1
    return score


def extract_page(html_text: str, url: str, topic: str):
    soup = BeautifulSoup(html_text, "html.parser")
    for tag in soup(["script","style","noscript","svg","canvas","iframe","form","nav","footer","aside"]):
        tag.decompose()
    title = clean_text((soup.title.string if soup.title and soup.title.string else ""))
    if not title:
        h1 = soup.find("h1")
        title = clean_text(h1.get_text(" ", strip=True)) if h1 else urllib.parse.urlsplit(url).netloc

    kws = keywords(topic)
    sections = []
    current_heading = "Key information"
    seen = set()

    main = soup.find("main") or soup.find("article") or soup.body or soup
    for el in main.find_all(["h1","h2","h3","p","li","blockquote","td"], recursive=True):
        if el.name in {"h1","h2","h3"}:
            h = clean_text(el.get_text(" ", strip=True))
            if 2 < len(h) < 180:
                current_heading = h
            continue
        txt = clean_text(el.get_text(" ", strip=True))
        if len(txt) < 55 or len(txt) > 2200:
            continue
        sig = re.sub(r"\W+", "", txt.lower())[:220]
        if sig in seen:
            continue
        seen.add(sig)
        sc = score_text(current_heading + " " + txt, kws)
        sections.append({"heading": current_heading, "text": txt, "score": sc})

    sections.sort(key=lambda x: x["score"], reverse=True)
    best = sections[:14] if kws else sections[:10]
    body_text = " ".join(x["text"] for x in best)
    return {
        "title": title[:240],
        "url": url,
        "domain": urllib.parse.urlsplit(url).netloc,
        "sections": best,
        "word_count": len(body_text.split()),
    }, soup


def discover_links(soup: BeautifulSoup, base_url: str, topic: str, limit=60):
    base = urllib.parse.urlsplit(base_url)
    kws = keywords(topic)
    out = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = urllib.parse.urljoin(base_url, a.get("href"))
        try:
            p = urllib.parse.urlsplit(href)
        except Exception:
            continue
        if p.scheme not in {"http","https"} or p.netloc != base.netloc:
            continue
        path = p.path.lower()
        if any(path.endswith(ext) for ext in (".jpg",".jpeg",".png",".gif",".webp",".svg",".zip",".mp4",".mp3",".xml")):
            continue
        normalized = urllib.parse.urlunsplit((p.scheme,p.netloc,p.path or "/",p.query,""))
        if normalized in seen or normalized == base_url:
            continue
        seen.add(normalized)
        anchor = clean_text(a.get_text(" ", strip=True))
        sc = score_text(anchor + " " + p.path.replace("-"," ").replace("_"," "), kws)
        out.append((sc, normalized))
    out.sort(key=lambda x: x[0], reverse=True)
    return [u for _,u in out[:limit]]


def ddg_search(query: str, limit=8):
    endpoint = "https://html.duckduckgo.com/html/"
    r = requests.post(endpoint, data={"q": query}, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    results = []
    for a in soup.select("a.result__a"):
        href = a.get("href")
        if not href:
            continue
        p = urllib.parse.urlsplit(href)
        qs = urllib.parse.parse_qs(p.query)
        if "uddg" in qs:
            href = urllib.parse.unquote(qs["uddg"][0])
        try:
            href = validate_url(href)
        except Exception:
            continue
        results.append(href)
        if len(results) >= limit:
            break
    return results


def research(payload):
    mode = (payload.get("mode") or "topic").strip()
    query = clean_text(payload.get("query") or "")
    depth = payload.get("depth") or "standard"
    if not query:
        raise ValueError("Enter a topic, URL, or text to research.")

    pages = []
    errors = []
    related = []

    if mode == "text":
        paras = [clean_text(x) for x in re.split(r"\n\s*\n|(?<=[.!?])\s{2,}", payload.get("rawText") or query) if len(clean_text(x)) > 45]
        topic = clean_text(payload.get("topic") or "Pasted material")
        kws = keywords(topic)
        ranked = sorted((({"heading":"Pasted material","text":p,"score":score_text(p,kws)}) for p in paras), key=lambda x:x["score"], reverse=True)[:24]
        pages.append({"title":"Pasted transcript / notes","url":"local://pasted-text","domain":"Local source","sections":ranked,"word_count":sum(len(x["text"].split()) for x in ranked)})
        return build_result(topic, mode, pages, errors, related)

    if mode == "url":
        start = validate_url(query)
        topic = clean_text(payload.get("topic") or urllib.parse.urlsplit(start).netloc)
        html_text, final_url = safe_get(start)
        page, soup = extract_page(html_text, final_url, topic)
        pages.append(page)
        max_pages = 5 if depth == "standard" else 12
        links = discover_links(soup, final_url, topic, limit=max_pages * 3)
        for link in links[:max_pages-1]:
            try:
                time.sleep(0.22)
                h,u = safe_get(link)
                p,_ = extract_page(h,u,topic)
                if p["word_count"] >= 35:
                    pages.append(p)
            except Exception as e:
                errors.append({"url":link,"message":str(e)[:180]})
        return build_result(topic, mode, pages, errors, related)

    topic = query
    urls = ddg_search(topic, limit=7 if depth == "standard" else 12)
    if not urls:
        raise ValueError("No search results were found. Try a more specific query or paste a source URL.")
    for url in urls:
        try:
            h,u = safe_get(url)
            p,_ = extract_page(h,u,topic)
            if p["word_count"] >= 35:
                pages.append(p)
            time.sleep(0.18)
        except Exception as e:
            errors.append({"url":url,"message":str(e)[:180]})
    return build_result(topic, mode, pages, errors, related)


def build_result(topic, mode, pages, errors, related):
    if not pages:
        raise ValueError("Sources were found, but none could be safely extracted.")
    for p in pages:
        p["relevance"] = round(sum(max(0,s.get("score",0)) for s in p["sections"][:5]) + min(p["word_count"],900)/300, 1)
    pages.sort(key=lambda p: p["relevance"], reverse=True)

    guide = []
    used = set()
    for p in pages:
        for s in p["sections"][:6]:
            key = re.sub(r"\W+","", s["text"].lower())[:160]
            if key in used:
                continue
            used.add(key)
            guide.append({
                "heading": s["heading"],
                "text": s["text"],
                "sourceTitle": p["title"],
                "sourceUrl": p["url"],
                "domain": p["domain"],
                "score": s["score"],
            })
    guide.sort(key=lambda x: x["score"], reverse=True)
    guide = guide[:18]

    nodes = []
    seenh = set()
    for item in guide:
        h = clean_text(item["heading"])
        if h.lower() in seenh or h.lower() in {"key information","pasted material"} or len(h) < 4:
            continue
        seenh.add(h.lower())
        nodes.append(h[:90])
        if len(nodes) >= 10:
            break

    return {
        "topic": topic,
        "mode": mode,
        "created_at": int(time.time()),
        "source_count": len(pages),
        "pages": pages,
        "guide": guide,
        "map": nodes,
        "errors": errors[:8],
        "notice": "This V1 is source-first extraction. It does not invent missing facts. Open Evidence or Sources to verify each passage in context.",
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LearnOS/0.1"

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))

    def _rate_ok(self):
        ip = self.client_address[0]
        now = time.time()
        with RATE_LOCK:
            q = RATE[ip]
            while q and now - q[0] > RATE_WINDOW:
                q.popleft()
            if len(q) >= RATE_MAX:
                return False
            q.append(now)
            return True

    def do_POST(self):
        if self.path != "/api/research":
            return json_response(self, {"error":"Not found"}, 404)
        if not self._rate_ok():
            return json_response(self, {"error":"Too many research requests. Try again shortly."}, 429)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 700_000:
                raise ValueError("Request body is empty or too large.")
            body = self.rfile.read(length)
            payload = json.loads(body)
            result = research(payload)
            return json_response(self, result)
        except ValueError as e:
            return json_response(self, {"error":str(e)}, 400)
        except Exception as e:
            return json_response(self, {"error":"Research failed safely.", "detail":str(e)[:220]}, 500)

    def do_GET(self):
        if self.path == "/api/health":
            return json_response(self, {"ok":True,"service":"LearnOS"})
        path = self.path.split("?",1)[0]
        if path == "/":
            file = STATIC / "index.html"
        else:
            rel = path.lstrip("/")
            file = (STATIC / rel).resolve()
            if STATIC.resolve() not in file.parents:
                self.send_error(403); return
        if not file.exists() or not file.is_file():
            self.send_error(404); return
        ctype = "text/plain; charset=utf-8"
        if file.suffix == ".html": ctype = "text/html; charset=utf-8"
        elif file.suffix == ".css": ctype = "text/css; charset=utf-8"
        elif file.suffix == ".js": ctype = "application/javascript; charset=utf-8"
        elif file.suffix == ".svg": ctype = "image/svg+xml"
        data = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print(f"LearnOS running on http://localhost:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
