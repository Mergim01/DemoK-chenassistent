# Küchenassistent PoC

Ein einfacher Proof of Concept für einen sprachgesteuerten Küchenassistenten mit Next.js.

## Features

- **Spracherkennung:** Nutzt die Web Speech API des Browsers (Chrome/Edge empfohlen).
- **Datenbank:** Speichert das Inventar in einer lokalen JSON-Datei (`data/inventory.json`).
- **Verarbeitung:** Versteht einfache deutsche Befehle wie:
  - "Füge zwei Äpfel hinzu"
  - "Packe 5 Bananen dazu"
  - "Tue einen Liter Milch ein"

## Installation & Start

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

2. **Server starten:**
   ```bash
   npm run dev
   ```

3. **Browser öffnen:**
   Gehe zu `http://localhost:3000`.

## Nutzung

1. Klicke auf "Sprechen".
2. Sage einen Befehl (z.B. "Füge drei Eier hinzu").
3. Klicke auf "Ausführen" (oder warte, falls Auto-Send aktiviert wäre).
4. Das Inventar wird aktualisiert.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Lokales JSON als Datenbank
