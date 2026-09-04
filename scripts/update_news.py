#!/usr/bin/env python3
import os, re, json, html, hashlib, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from email.utils import parsedate_to_datetime

BASE_URL = "https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO"
MODEL = "gemini-3.1-flash-lite"
MAX_NEW_STORIES_PER_RUN = 8
SOURCES = [
    {"name": "Lynn News", "feed": "https://www.lynnnews.co.uk/_api/rss/kings_lynn_news_feed.xml"},
    {"name": "Fenland Citizen", "feed": "https://www.fenlandcitizen.co.uk/_api/rss/fenland_citizen_news_feed.xml"},
]
USER_AGENT = "FenlandAngelsRadio-Newsroom/1.0 (+https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO/)"

class ArticleTextParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() in {"script","style","nav","footer","header","form","svg"}: self.skip += 1
    def handle_endtag(self, tag):
        if tag.lower() in {"script","style","nav","footer","header","form","svg"} and self.skip: self.skip -= 1
    def handle_data(self, data):
        if not self.skip:
            t = re.sub(r"\s+", " ", data).strip()
            if len(t) > 35: self.parts.append(t)

def fetch_bytes(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()

def fetch_text(url, timeout=25): return fetch_bytes(url, timeout).decode("utf-8", errors="replace")
def clean_html(v): return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(v or ""))).strip()

def child_text(node, names):
    for child in list(node):
        if child.tag.split("}")[-1].lower() in names and child.text: return child.text.strip()
    return ""

def item_link(node):
    for child in list(node):
        if child.tag.split("}")[-1].lower() == "link":
            if child.text and child.text.strip(): return child.text.strip()
            if child.attrib.get("href"): return child.attrib["href"].strip()
    return ""

def parse_feed(source):
    root = ET.fromstring(fetch_bytes(source["feed"])); out = []
    for node in root.iter():
        if node.tag.split("}")[-1].lower() not in {"item","entry"}: continue
        title = clean_html(child_text(node,{"title"})); link = item_link(node)
        desc = clean_html(child_text(node,{"description","summary","content","encoded"}))
        guid = child_text(node,{"guid","id"}) or link or title
        date_text = child_text(node,{"pubdate","published","updated","date"}); published = ""
        if date_text:
            try: published = parsedate_to_datetime(date_text).astimezone(timezone.utc).isoformat()
            except Exception: published = date_text
        if title and link: out.append({"source":source["name"],"title":title,"link":link,"description":desc,"guid":guid,"published":published})
    return out

def article_context(url):
    try:
        p = ArticleTextParser(); p.feed(fetch_text(url)); return re.sub(r"\s+"," "," ".join(p.parts)).strip()[:10000]
    except Exception: return ""

def story_key(item): return hashlib.sha256((item["source"]+"|"+item["guid"]).encode()).hexdigest()[:24]
def load_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except Exception: return fallback

def gemini_rewrite(item, article_text, api_key):
    evidence = article_text if len(article_text) >= 200 else item.get("description","")
    prompt = f'''You are the automated local-news desk for Fenland Angels Radio — The Sound of the Fens.
Write a factual local radio news brief using ONLY the evidence supplied below.
Rules: do not copy sentences; do not invent or infer unsupported facts; preserve names, places, dates, numbers and outcomes only when supported; use neutral UK radio-news style; do not sensationalise; do not claim Fenland Angels witnessed, investigated, confirmed or exclusively discovered the story. If evidence is too thin or unclear, return exactly SKIP.
Output plain text exactly as:
HEADLINE: <original headline, max 90 characters>
BRIEF: <70-130 words, 1-2 short paragraphs>

Source publication: {item['source']}
Original headline: {item['title']}
Original URL: {item['link']}
Evidence:
{evidence[:10000]}'''
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    payload = {"contents":[{"parts":[{"text":prompt}]}],"generationConfig":{"temperature":0.2,"maxOutputTokens":400,"thinkingConfig":{"thinkingBudget":0}}}
    req = urllib.request.Request(endpoint,data=json.dumps(payload).encode(),headers={"Content-Type":"application/json","x-goog-api-key":api_key,"User-Agent":USER_AGENT},method="POST")
    with urllib.request.urlopen(req, timeout=45) as r: response = json.loads(r.read().decode())
    text = response["candidates"][0]["content"]["parts"][0]["text"].strip()
    if text == "SKIP": return None
    hm = re.search(r"HEADLINE:\s*(.+)", text); bm = re.search(r"BRIEF:\s*(.+)", text, re.S)
    return (hm.group(1).strip(), bm.group(1).strip()) if hm and bm else None

def rss_escape(s): return html.escape(s or "", quote=False)

def build_rss(stories):
    now = datetime.now(timezone.utc)
    parts = ['<?xml version="1.0" encoding="UTF-8"?>','<rss version="2.0">','<channel>','<title>Fenland Angels Radio Local News</title>',f'<link>{BASE_URL}/news.html</link>','<description>Local news briefs from Fenland Angels Radio — The Sound of the Fens.</description>','<language>en-gb</language>',f'<lastBuildDate>{now.strftime("%a, %d %b %Y %H:%M:%S +0000")}</lastBuildDate>']
    for s in stories[:30]:
        fb = f"📰 FENLAND ANGELS RADIO | LOCAL NEWS\n\n{s['headline']}\n\n{s['brief']}\n\n🔗 More details: {s['original_url']}\n\nFenland Angels Radio — The Sound of the Fens\n\n#FenlandAngelsRadio #TheSoundOfTheFens #LocalNews #Fenland"
        parts += ['<item>',f'<title>{rss_escape(s["headline"])}</title>',f'<link>{rss_escape(s["original_url"])}</link>',f'<guid isPermaLink="false">{rss_escape(s["id"])}</guid>',f'<pubDate>{s["rss_date"]}</pubDate>',f'<description><![CDATA[{fb.replace("]]>", "]]>&gt;")}]]></description>','</item>']
    parts += ['</channel>','</rss>']; return "\n".join(parts)+"\n"

def main():
    api_key = os.environ.get("GEMINI_API_KEY","").strip()
    if not api_key: raise SystemExit("GEMINI_API_KEY is not available.")
    state = load_json("news-state.json", {"processed":[]}); processed = set(state.get("processed",[]))
    existing = load_json("news-data.json", {"stories":[]}); stories = existing.get("stories",[])
    candidates = []
    for source in SOURCES:
        try: candidates.extend(parse_feed(source))
        except Exception as e: print(f"Feed error for {source['name']}: {e}")
    new_items = []
    for item in candidates:
        key = story_key(item)
        if key not in processed: item["_key"] = key; new_items.append(item)
    for item in new_items[:MAX_NEW_STORIES_PER_RUN]:
        print(f"Processing: {item['source']} | {item['title']}")
        try:
            rewritten = gemini_rewrite(item, article_context(item["link"]), api_key); processed.add(item["_key"])
            if not rewritten: print("Skipped by editorial filter."); continue
            headline, brief = rewritten; now = datetime.now(timezone.utc)
            stories.insert(0,{"id":"fenland-news-"+item["_key"],"headline":headline,"brief":brief,"original_url":item["link"],"source":item["source"],"published":item.get("published",""),"generated_at":now.isoformat(),"rss_date":now.strftime("%a, %d %b %Y %H:%M:%S +0000")})
        except Exception as e: print(f"Error processing story: {e}")
    stories = stories[:100]
    with open("news-data.json","w",encoding="utf-8") as f: json.dump({"updated_at":datetime.now(timezone.utc).isoformat(),"stories":stories},f,ensure_ascii=False,indent=2)
    with open("news-state.json","w",encoding="utf-8") as f: json.dump({"processed":list(processed)[-1000:]},f,indent=2)
    with open("news.xml","w",encoding="utf-8") as f: f.write(build_rss(stories))
    print(f"Newsroom complete. Stored {len(stories)} stories.")
if __name__ == "__main__": main()
