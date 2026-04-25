# Deutsches Post-Template

## Titel
Teltonika Commander — Open-Source Web-UI + Home Assistant Add-on für Teltonika GPS-Tracker

## Text
Ich habe eine Web-UI entwickelt und veröffentlicht, mit der sich **Teltonika FMT/FMB GPS-Tracker** (FMT100, FMB003, FMB920, FMB140 etc.) per Fernzugriff konfigurieren lassen — ohne physischen Zugang zum Gerät.

**Funktionen:**
- GPRS-Befehle via Flespi Codec-12 — sofortige Übertragung mit Antwort
- SMS-Fallback via Sipgate für die Erstkonfiguration (vor dem APN-Setup)
- Presets: APN, Server, BT-OBD2, Tracking-Intervalle, Outputs, Status-Abfragen
- Kommando-History mit Ausführungsstatus pro Gerät
- PWA — auf iPhone/Android als App installierbar
- **Home Assistant Add-on** mit Ingress-Unterstützung (läuft direkt auf Hassio)
- Datenschutz-Modus zum Ausblenden von IMEI und GPS-Koordinaten für Screenshots
- Dark/Light-Theme, Deutsch und Englisch

**Installation als Home Assistant Add-on:**
1. Einstellungen → Add-ons → Add-on Store → ⋮ → Repositories
2. Hinzufügen: `https://github.com/kpma1985/teltonika-commander`
3. **Teltonika Commander** installieren und Flespi-Token eintragen

**GitHub:** https://github.com/kpma1985/teltonika-commander

Bei Fragen gerne melden!
