FENLAND ANGELS RADIO — WEATHER ACROSS THE FENS
================================================

This package ADDS the weather system. It does not replace your existing website/app.

FILES
-----
weather.html
weather-data.json
weather.xml
assets/weather.css
scripts/update_weather.py
.github/workflows/weather.yml

WHAT IT DOES
------------
At about 06:30 UK time every morning, GitHub Actions:
1. Fetches today's forecast for five representative areas across the Fens.
2. Updates weather-data.json for the public weather page.
3. Creates one fresh RSS item in weather.xml for Zapier.
4. Commits the generated forecast files back into the repository.

AREAS
-----
Northern Fens — Spalding & South Holland
Eastern Fens — King's Lynn & West Norfolk
Central Fens — Wisbech, March & central Fenland
Western Fens — Peterborough & Whittlesey
Southern Fens — Ely, Chatteris & southern Fens

WEATHER PAGE
------------
https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO/weather.html

ZAPIER RSS FEED
---------------
https://fenlandangelsradio.github.io/FENLAND-ANGELS-RADIO/weather.xml

UPLOAD
------
1. Download and unzip this package on your Mac.
2. Upload the CONTENTS into the root of your existing FENLAND-ANGELS-RADIO repository.
3. Preserve the folders exactly, including .github/workflows, scripts and assets.
4. Do not expect GitHub to automatically unpack the ZIP itself.

AFTER UPLOAD
------------
1. Open the Actions tab.
2. Open "Update Weather Across The Fens".
3. Click "Run workflow" once.
4. Wait for the run to finish.
5. Open the weather page above.
6. Then use weather.xml as the RSS trigger URL in Zapier.

The page deliberately describes this as a regional outlook using representative
forecast points rather than claiming every village has identical weather.
