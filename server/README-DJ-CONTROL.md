# FAR Live DJ Manager

The installed service is `far-dj-manager.service`. It runs `dj_manager.py` as `/opt/far-live/dj-manager.py`, with the dedicated generator `/opt/far-live/dj_gateway.py`. Its authenticated API binds to 127.0.0.1:8765. The gateway control port is 1237 and DJ input port is 8085.

Do not install a second service on port 8765. The obsolete duplicate `far-dj-control.service` has been stopped and disabled. The compatibility entry point `dj-control.py` delegates to the current manager; it does not restart station output.

Use `install_dj_compatibility.py` only after inspecting the installed host. It refuses installation while DJ accounts or a live selection exist, retains a private backup, checks the generated Liquidsoap configuration, and restores the previous files if installation fails. It restarts the dedicated DJ gateway and manager only.

The server owns DJ accounts and generates connection passwords. Input changes require all DJs to disconnect. Selecting a DJ requires a confirmed connected input. Returning to automation requires an acknowledged gateway command. Listing accounts never returns passwords.

Keep the API private. The installed website connection uses a dedicated restricted SSH account, a forced `far-api` command and an exact server host-key pin. `web_bridge.py` accepts only fixed DJ and call-queue routes and runs without root privileges. Supabase stores `FAR_SERVER_SSH_HOST`, `FAR_SERVER_SSH_USER`, `FAR_SERVER_SSH_KEY_B64` and `FAR_SERVER_SSH_SHA256` as encrypted secrets. An authenticated HTTPS bridge remains an optional alternative. Tokens belong in protected server settings and Supabase secrets, never website files.

Verification: `test_dj_manager.py` covers validation and control failures. `check_dj_test.py` runs an isolated Liquidsoap input with generated audio and checks connect, select, return and disconnect. These checks do not switch the public station or prove a remote DJ's internet connection.
