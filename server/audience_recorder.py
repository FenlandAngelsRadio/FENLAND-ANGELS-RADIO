"""Read-only stream monitoring; saves actual counts, never guessed zeros."""
import json
import re
import os
from datetime import datetime, timezone
from html import unescape
from urllib.request import Request, urlopen


def parse_count(html):
    text=unescape(re.sub(r'<[^>]+>', ' ', html))
    matches=re.findall(r'Current Listeners:\s*(\d+)', text, re.I)
    if len(matches)!=1:
        raise ValueError('Expected exactly one FAR mount listener count.')
    return int(matches[0])


def main():
    with urlopen('https://hq3.yesstreaming.net:7085/status.xsl',timeout=15) as response:
        listeners=parse_count(response.read(262145).decode('utf-8'))
    body=json.dumps({'created_at':datetime.now(timezone.utc).isoformat(),
                     'listeners':listeners,'mount':'/stream','stream_online':True}).encode()
    request=Request('https://nkdjnrycpdiwburtkzen.supabase.co/rest/v1/far_icecast_snapshots',
        data=body,headers={'apikey':os.environ['FAR_AUDIENCE_PUBLISHABLE_KEY'],
                          'Content-Type':'application/json','Prefer':'return=minimal'})
    with urlopen(request,timeout=15) as response:
        if response.status not in {200,201,204}:
            raise RuntimeError('Could not save audience reading.')
    print('Recorded actual stream count:',listeners)


if __name__=='__main__':
    main()
