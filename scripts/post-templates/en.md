# English Post Template

## Title
Teltonika Commander — open-source web UI + Home Assistant add-on for Teltonika FMT/FMB GPS trackers

## Body
I built and open-sourced a web UI for remotely configuring **Teltonika FMT/FMB GPS trackers** (FMT100, FMB003, FMB920, FMB140 etc.) via [Flespi](https://flespi.io) and [Sipgate](https://www.sipgate.de) — without physical access to the device.

**Features:**
- GPRS commands via Flespi Codec-12 — instant delivery, response included
- SMS fallback via Sipgate for initial setup (before APN is configured)
- Presets: APN, Server, BT-OBD2, Tracking intervals, I/O Outputs, Status queries
- Command history with execution status per device
- PWA — installable on iPhone/Android as a home screen app
- **Home Assistant add-on** with Ingress support (runs on your Hassio instance)
- Privacy mode to blur IMEI and GPS coordinates for screenshots
- Dark/light theme, German and English UI

**Install as Home Assistant Add-on:**
1. Settings → Add-ons → Add-on Store → ⋮ → Repositories
2. Add: `https://github.com/kpma1985/teltonika-commander`
3. Install **Teltonika Commander** and enter your Flespi token

**GitHub:** https://github.com/kpma1985/teltonika-commander

Happy to answer questions!
