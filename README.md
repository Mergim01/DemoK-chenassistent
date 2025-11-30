# Küchenassistent PoC

Ein einfacher Proof of Concept für einen sprachgesteuerten Küchenassistenten mit Next.js.

## Features

- **Spracherkennung:** Nutzt die Web Speech API des Browsers (Chrome/Edge empfohlen).
- **Datenbank:** Speichert das Inventar in Vercel Postgres (SQL).
- **Verarbeitung:** Versteht einfache deutsche Befehle wie:
  - "Füge zwei Äpfel hinzu"
  - "Packe 5 Bananen dazu"
  - "Tue einen Liter Milch ein"

## Installation & Start

1. **Abhängigkeiten installieren:**
   ```bash
   npm install
   ```

2. **Lokale Entwicklung (mit Vercel Postgres):**
   Um lokal zu entwickeln, müssen Sie die Vercel CLI nutzen und die Umgebungsvariablen ziehen:
   ```bash
   npm i -g vercel
   vercel link
   vercel env pull .env.development.local
   npm run dev
   ```

3. **Browser öffnen:**
   Gehe zu `http://localhost:3000`.

## Deployment auf Vercel

1. Pushen Sie den Code auf GitHub/GitLab/Bitbucket.
2. Importieren Sie das Projekt in [Vercel](https://vercel.com).
3. Gehen Sie im Vercel Dashboard zu Ihrem Projekt > **Storage**.
4. Klicken Sie auf **Connect Store** und wählen Sie **Postgres**.
5. Erstellen Sie eine neue Datenbank und verknüpfen Sie sie mit dem Projekt ("Connect").
   - Dies setzt automatisch die notwendigen Umgebungsvariablen (`POSTGRES_URL`, etc.).
6. Starten Sie ein Deployment (falls nicht automatisch geschehen).
   - Die Datenbank-Tabelle wird beim ersten Zugriff automatisch erstellt.

## Nutzung

1. Klicke auf "Sprechen".
2. Sage einen Befehl (z.B. "Füge drei Eier hinzu").
3. Klicke auf "Ausführen" (oder warte, falls Auto-Send aktiviert wäre).
4. Das Inventar wird aktualisiert.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Vercel Postgres (@vercel/postgres)
