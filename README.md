# Attendance Tracker

Camera-based attendance with photo capture, automatic CSV records, photos saved to disk, and PDF reports.

## Sharing on your network (host laptop)

1. Run the server (below).
2. Open the app and use the **Scan to join** QR card on the page — other devices on the same
   Wi-Fi scan it and open the app directly.
3. Anyone who opens the app on their phone/laptop can log attendance — photos and CSV are saved on
   **this host machine**, and **Save PDF** also writes a copy into the `reports/` folder here.

> The app runs over **HTTPS** with a self-generated certificate so the camera works on other
> devices. The first time you open it, your browser shows a certificate warning — choose
> *Advanced → Proceed* (it's your own machine, the certificate simply isn't from a public CA).

## Public access — any network (Cloudflare)

Double-click **`start-online.command`** (macOS). It starts the server **and** a free Cloudflare
tunnel, then opens the generated public link like:

```
https://random-words.trycloudflare.com
```

Anyone anywhere can open that link on their phone or laptop, use the camera, log attendance, and
the photos/CSV/PDFs still save on this laptop.

Notes:
- The `trycloudflare.com` URL is **temporary** — it changes every time the script runs. The QR
  card on the page always shows the current link, so refresh the page after restarting.
- For a **permanent** URL you'd add a fixed domain to the tunnel instead
  (requires a Cloudflare account + your own domain).

## Requirements

- **Node.js** (any recent version) — download from <https://nodejs.org>
- A desktop browser (Chrome, Edge, Safari, Firefox)

> The app must be opened through the local server. Opening `index.html` by double-click
> does **not** work — the browser blocks the camera and file saving on `file://`.

## Run on Windows

1. Install Node.js if you don't have it.
2. Go to the folder `attendance` and double-click **`start.bat`**.
3. Your browser opens `https://localhost:3000` automatically.
4. Close the black server window to stop the app.

## Run on macOS

1. Install Node.js if you don't have it.
2. Open **Terminal** and type:

   ```bash
   cd /path/to/attendance
   node server.js
   ```

3. Your browser opens `https://localhost:3000` automatically.
4. Press `Ctrl+C` in the terminal to stop the app.

## How it works

- Capture a photo, enter **Name** and **Office**, press **Save**.
- Each record gets an ID (`EMP001`, `EMP002`, ...).
- The photo is saved as `images/{Attendee Name}.jpg`.
- The attendance record is appended to `data/attendance.csv`
  with columns: `ID, Name, Office, Date, Time In, Time Out, Status, File Location`.
- Records are also kept in the browser and shown in the table.
- You can import / export the CSV, and clear all records.

## Troubleshooting

- **Photo says "not saved · server error"** — the server is from an older version.
  Close the server window and run `start.bat` (or `node server.js`) again, then refresh the page.
- **"attendance.csv is locked"** — close the file in Excel, then save again.
- **Camera doesn't start** — make sure you loaded `http://localhost:3000`, not a `file://` path,
  and allow the camera permission when prompted.
- **Same photo filename reused** — attendees with the same name overwrite the same photo file.
- macOS double-click shortcut: right-click → *New Terminal at Folder* is easiest, or create a
  `start.command` file containing `node server.js`.


