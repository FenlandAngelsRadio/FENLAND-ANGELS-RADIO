# FAR Live DJ Manager deployment
Repository code is only the control-plane source. Deploy on far-cloud-live-01 after reviewing the existing Icecast auth method.

1. sudo install -d -m 700 /var/lib/far-live /etc/far-live /opt/far-live
2. sudo install -m 700 server/dj-control.py /opt/far-live/dj-control.py
3. Create /etc/far-live/dj-control.env mode 600 containing FAR_LIVE_ADMIN_TOKEN=<a new random token>
4. sudo install -m 644 server/far-dj-control.service /etc/systemd/system/far-dj-control.service
5. sudo systemctl daemon-reload && sudo systemctl enable --now far-dj-control

SECURITY: The bridge binds to 127.0.0.1. Do not expose port 8765 publicly. Put an authenticated HTTPS reverse proxy/private tunnel in front of it for the Supabase Edge Function and set FAR_LIVE_ADMIN_URL + FAR_LIVE_ADMIN_TOKEN as Edge Function secrets.

IMPORTANT: dj-control.py intentionally does not rewrite icecast.xml. The current production Icecast authentication layout must be inspected before wiring generated per-DJ credentials into Icecast. Do not replace the working Private Major mount blindly.
