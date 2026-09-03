#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request
from datetime import datetime
from email.utils import format_datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("Europe/London")
SITE_BASE = "https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO"

REGIONS = [
    {"zone": "Northern Fens", "name": "Spalding & South Holland", "lat": 52.7871, "lon": -0.1510},
    {"zone": "Eastern Fens", "name": "King's Lynn & West Norfolk", "lat": 52.7517, "lon": 0.3952},
    {"zone": "Central Fens", "name": "Wisbech, March & central Fenland", "lat": 52.6663, "lon": 0.1600},
    {"zone": "Western Fens", "name": "Peterborough & Whittlesey", "lat": 52.5726, "lon": -0.2427},
    {"zone": "Southern Fens", "name": "Ely, Chatteris & southern Fens", "lat": 52.3995, "lon": 0.2624},
]

WMO = {
    0:"Clear", 1:"Mainly clear", 2:"Partly cloudy", 3:"Overcast",
    45:"Fog", 48:"Rime fog", 51:"Light drizzle", 53:"Drizzle", 55:"Heavy drizzle",
    56:"Freezing drizzle", 57:"Heavy freezing drizzle", 61:"Light rain", 63:"Rain",
    65:"Heavy rain", 66:"Freezing rain", 67:"Heavy freezing rain", 71:"Light snow",
    73:"Snow", 75:"Heavy snow", 77:"Snow grains", 80:"Light rain showers",
    81:"Rain showers", 82:"Heavy rain showers", 85:"Snow showers", 86:"Heavy snow showers",
    95:"Thunderstorms", 96:"Thunderstorms with hail", 99:"Severe thunderstorms with hail"
}

def fetch_region(r):
    params = urllib.parse.urlencode({
        "latitude": r["lat"],
        "longitude": r["lon"],
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
        "timezone": "Europe/London",
        "forecast_days": 1
    })
    url = "https://api.open-meteo.com/v1/forecast?" + params
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.load(resp)
    d = data["daily"]
    return {
        "zone": r["zone"],
        "name": r["name"],
        "condition": WMO.get(int(d["weather_code"][0]), "Mixed conditions"),
        "high_c": round(float(d["temperature_2m_max"][0])),
        "low_c": round(float(d["temperature_2m_min"][0])),
        "rain_chance": round(float(d["precipitation_probability_max"][0] or 0)),
        "wind_kmh": round(float(d["wind_speed_10m_max"][0] or 0)),
    }

def build_summary(regions):
    lines = ["🌤️ WEATHER ACROSS THE FENS | FENLAND ANGELS RADIO", ""]
    for r in regions:
        lines.append(
            f"{r['zone']} — {r['name']}: {r['condition']}. "
            f"High {r['high_c']}°C, low {r['low_c']}°C, "
            f"rain chance {r['rain_chance']}%, winds up to {r['wind_kmh']} km/h."
        )
    lines += [
        "",
        "A regional outlook from representative points across the Fens.",
        f"Full forecast: {SITE_BASE}/weather.html",
        "",
        "#FenlandAngelsRadio #TheSoundOfTheFens #FensWeather #Fenland #WestNorfolk #SouthHolland"
    ]
    return "\\n".join(lines)

def main():
    now = datetime.now(TZ)
    regions = [fetch_region(r) for r in REGIONS]
    payload = {
        "updated": now.isoformat(),
        "updated_display": now.strftime("%A %d %B %Y at %H:%M"),
        "date": now.date().isoformat(),
        "regions": regions
    }
    (ROOT / "weather-data.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    summary = build_summary(regions)
    guid = f"fenland-weather-{now.date().isoformat()}"
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Fenland Angels Radio - Weather Across The Fens</title>
    <link>{SITE_BASE}/weather.html</link>
    <description>Daily regional weather outlook across the Fens.</description>
    <language>en-gb</language>
    <lastBuildDate>{format_datetime(now)}</lastBuildDate>
    <item>
      <title>{escape("Weather Across The Fens - " + now.strftime("%A %d %B %Y"))}</title>
      <link>{SITE_BASE}/weather.html</link>
      <guid isPermaLink="false">{guid}</guid>
      <pubDate>{format_datetime(now)}</pubDate>
      <description>{escape(summary)}</description>
    </item>
  </channel>
</rss>
'''
    (ROOT / "weather.xml").write_text(xml, encoding="utf-8")
    print(summary)

if __name__ == "__main__":
    main()
