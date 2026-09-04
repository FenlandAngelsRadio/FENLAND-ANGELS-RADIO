FENLAND ANGELS RADIO — AUTOMATED NEWSROOM

This package is additive to the existing FENLAND-ANGELS-RADIO repository.

It checks Lynn News and Fenland Citizen as story-alert feeds, reads available article context, asks Gemini to create an original neutral Fenland Angels Radio brief using only supported facts, then updates news-data.json and news.xml.

Required GitHub secret: GEMINI_API_KEY

Files:
.github/workflows/news.yml
scripts/update_news.py
assets/news.css
news.html
news-data.json
news-state.json
news.xml

Test after upload:
GitHub > Actions > Update Fenland Angels Newsroom > Run workflow > main > Run workflow

Public news page:
https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO/news.html

RSS feed for Make:
https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO/news.xml

Designed to run around 00:45, 06:45, 12:45 and 18:45 UK local time.

Once tested, use ONE Make news scenario watching news.xml. Then disable the two old individual news scenarios so Weather can use the second active Make slot.
