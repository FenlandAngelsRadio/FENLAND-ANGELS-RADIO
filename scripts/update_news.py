#!/usr/bin/env python3

import os
import re
import json
import html
import hashlib
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

from datetime import datetime, timezone
from html.parser import HTMLParser
from email.utils import parsedate_to_datetime


BASE_URL = "https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO"
MODEL = "gemini-3.1-flash-lite"
MAX_NEW_STORIES_PER_RUN = 8

SOURCES = [
    {
        "name": "Lynn News",
        "feed": "https://www.lynnnews.co.uk/_api/rss/lynn_news_news_feed.xml",
    },
    {
        "name": "Fenland Citizen",
        "feed": "https://www.fenlandcitizen.co.uk/_api/rss/fenland_citizen_news_feed.xml",
    },
]

USER_AGENT = (
    "FenlandAngelsRadio-Newsroom/1.0 "
    "(+https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO/)"
)


class ArticleTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {
            "script",
            "style",
            "nav",
            "footer",
            "header",
            "form",
            "svg",
        }:
            self.skip += 1

    def handle_endtag(self, tag):
        if (
            tag.lower()
            in {
                "script",
                "style",
                "nav",
                "footer",
                "header",
                "form",
                "svg",
            }
            and self.skip
        ):
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            text = re.sub(r"\s+", " ", data).strip()

            if len(text) > 35:
                self.parts.append(text)


def fetch_bytes(url, timeout=25):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT},
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_text(url, timeout=25):
    return fetch_bytes(url, timeout).decode(
        "utf-8",
        errors="replace",
    )


def clean_html(value):
    return re.sub(
        r"\s+",
        " ",
        re.sub(
            r"<[^>]+>",
            " ",
            html.unescape(value or ""),
        ),
    ).strip()


def child_text(node, names):
    for child in list(node):
        tag = child.tag.split("}")[-1].lower()

        if tag in names and child.text:
            return child.text.strip()

    return ""


def item_link(node):
    for child in list(node):
        if child.tag.split("}")[-1].lower() == "link":
            if child.text and child.text.strip():
                return child.text.strip()

            if child.attrib.get("href"):
                return child.attrib["href"].strip()

    return ""


def parse_feed(source):
    root = ET.fromstring(fetch_bytes(source["feed"]))
    items = []

    for node in root.iter():
        if node.tag.split("}")[-1].lower() not in {
            "item",
            "entry",
        }:
            continue

        title = clean_html(
            child_text(
                node,
                {"title"},
            )
        )

        link = item_link(node)

        description = clean_html(
            child_text(
                node,
                {
                    "description",
                    "summary",
                    "content",
                    "encoded",
                },
            )
        )

        guid = (
            child_text(
                node,
                {"guid", "id"},
            )
            or link
            or title
        )

        date_text = child_text(
            node,
            {
                "pubdate",
                "published",
                "updated",
                "date",
            },
        )

        published = ""

        if date_text:
            try:
                published = (
                    parsedate_to_datetime(date_text)
                    .astimezone(timezone.utc)
                    .isoformat()
                )
            except Exception:
                published = date_text

        if title and link:
            items.append(
                {
                    "source": source["name"],
                    "title": title,
                    "link": link,
                    "description": description,
                    "guid": guid,
                    "published": published,
                }
            )

    return items


def article_context(url):
    try:
        parser = ArticleTextParser()
        parser.feed(fetch_text(url))

        return re.sub(
            r"\s+",
            " ",
            " ".join(parser.parts),
        ).strip()[:10000]

    except Exception:
        return ""


def story_key(item):
    raw = item["source"] + "|" + item["guid"]

    return hashlib.sha256(
        raw.encode()
    ).hexdigest()[:24]


def load_json(path, fallback):
    try:
        with open(
            path,
            encoding="utf-8",
        ) as file:
            return json.load(file)

    except Exception:
        return fallback


def gemini_rewrite(item, article_text, api_key):
    evidence = (
        article_text
        if len(article_text) >= 200
        else item.get("description", "")
    )

    prompt = f"""
You are the automated local-news desk for
Fenland Angels Radio — The Sound of the Fens.

Write a factual local radio news brief using ONLY
the evidence supplied below.

RULES:

- Do not copy sentences from the source.
- Do not invent facts.
- Do not infer unsupported facts.
- Preserve names, places, dates, numbers and outcomes
  only when supported by the evidence.
- Use neutral UK radio-news style.
- Do not sensationalise.
- Do not claim Fenland Angels Radio witnessed,
  investigated, confirmed or exclusively discovered
  the story.
- Make the story easy to read aloud on radio.
- Focus on information useful to people living
  across the Fens.
- If the evidence is too thin or unclear,
  return exactly:

SKIP

Output plain text exactly as:

HEADLINE: <headline, maximum 90 characters>

BRIEF: <70-130 words, 1-2 short paragraphs>

Source publication:
{item['source']}

Original headline:
{item['title']}

Original URL:
{item['link']}

Evidence:
{evidence[:10000]}
"""

    endpoint = (
        "https://generativelanguage.googleapis.com/"
        f"v1beta/models/{MODEL}:generateContent"
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt,
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 400,
            "thinkingConfig": {
                "thinkingBudget": 0,
            },
        },
    }

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )

    with urllib.request.urlopen(
        request,
        timeout=45,
    ) as response:
        result = json.loads(
            response.read().decode()
        )

    text = (
        result["candidates"][0]["content"]["parts"][0]["text"]
        .strip()
    )

    if text == "SKIP":
        return None

    headline_match = re.search(
        r"HEADLINE:\s*(.+)",
        text,
    )

    brief_match = re.search(
        r"BRIEF:\s*(.+)",
        text,
        re.S,
    )

    if headline_match and brief_match:
        return (
            headline_match.group(1).strip(),
            brief_match.group(1).strip(),
        )

    return None


def rss_escape(value):
    return html.escape(
        value or "",
        quote=False,
    )


def build_rss(stories):
    now = datetime.now(timezone.utc)

    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0">',
        '<channel>',
        '<title>Fenland Angels Radio Local News</title>',
        f'<link>{BASE_URL}/news.html</link>',
        (
            '<description>'
            'Local news briefs from Fenland Angels Radio '
            '— The Sound of the Fens.'
            '</description>'
        ),
        '<language>en-gb</language>',
        (
            f'<lastBuildDate>'
            f'{now.strftime("%a, %d %b %Y %H:%M:%S +0000")}'
            f'</lastBuildDate>'
        ),
    ]

    for story in stories[:30]:
        facebook_text = (
            "📰 FENLAND ANGELS RADIO | LOCAL NEWS\n\n"
            f"{story['headline']}\n\n"
            f"{story['brief']}\n\n"
            f"🔗 More details: {story['original_url']}\n\n"
            "Fenland Angels Radio — The Sound of the Fens\n\n"
            "#FenlandAngelsRadio "
            "#TheSoundOfTheFens "
            "#LocalNews "
            "#Fenland"
        )

        safe_facebook_text = facebook_text.replace(
            "]]>",
            "]]>&gt;",
        )

        parts += [
            "<item>",
            f'<title>{rss_escape(story["headline"])}</title>',
            f'<link>{rss_escape(story["original_url"])}</link>',
            (
                '<guid isPermaLink="false">'
                f'{rss_escape(story["id"])}'
                '</guid>'
            ),
            f'<pubDate>{story["rss_date"]}</pubDate>',
            (
                '<description><![CDATA['
                f'{safe_facebook_text}'
                ']]></description>'
            ),
            "</item>",
        ]

    parts += [
        "</channel>",
        "</rss>",
    ]

    return "\n".join(parts) + "\n"


def main():
    api_key = os.environ.get(
        "GEMINI_API_KEY",
        "",
    ).strip()

    if not api_key:
        raise SystemExit(
            "GEMINI_API_KEY is not available."
        )

    state = load_json(
        "news-state.json",
        {
            "processed": [],
        },
    )

    processed = set(
        state.get(
            "processed",
            [],
        )
    )

    existing = load_json(
        "news-data.json",
        {
            "stories": [],
        },
    )

    stories = existing.get(
        "stories",
        [],
    )

    candidates = []

    for source in SOURCES:
        try:
            source_items = parse_feed(source)
            candidates.extend(source_items)

            print(
                f"{source['name']}: "
                f"{len(source_items)} feed items found."
            )

        except Exception as error:
            print(
                f"Feed error for "
                f"{source['name']}: "
                f"{error}"
            )

    new_items = []

    for item in candidates:
        key = story_key(item)

        if key not in processed:
            item["_key"] = key
            new_items.append(item)

    for item in new_items[:MAX_NEW_STORIES_PER_RUN]:
        print(
            f"Processing: "
            f"{item['source']} | "
            f"{item['title']}"
        )

        try:
            rewritten = gemini_rewrite(
                item,
                article_context(item["link"]),
                api_key,
            )

            processed.add(
                item["_key"]
            )

            if not rewritten:
                print(
                    "Skipped by editorial filter."
                )
                continue

            headline, brief = rewritten

            now = datetime.now(
                timezone.utc
            )

            stories.insert(
                0,
                {
                    "id": (
                        "fenland-news-"
                        + item["_key"]
                    ),
                    "headline": headline,
                    "brief": brief,
                    "original_url": item["link"],
                    "source": item["source"],
                    "published": item.get(
                        "published",
                        "",
                    ),
                    "generated_at": now.isoformat(),
                    "rss_date": now.strftime(
                        "%a, %d %b %Y %H:%M:%S +0000"
                    ),
                },
            )

        except Exception as error:
            print(
                f"Error processing story: "
                f"{error}"
            )

    stories = stories[:100]

    with open(
        "news-data.json",
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            {
                "updated_at": (
                    datetime.now(
                        timezone.utc
                    ).isoformat()
                ),
                "stories": stories,
            },
            file,
            ensure_ascii=False,
            indent=2,
        )

    with open(
        "news-state.json",
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            {
                "processed": list(
                    processed
                )[-1000:]
            },
            file,
            indent=2,
        )

    with open(
        "news.xml",
        "w",
        encoding="utf-8",
    ) as file:
        file.write(
            build_rss(stories)
        )

    print(
        f"Newsroom complete. "
        f"Stored {len(stories)} stories."
    )


if __name__ == "__main__":
    main()
