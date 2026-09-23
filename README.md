# Attendance Tracker

Camera-based attendance with photo capture, automatic CSV records, and photos saved to disk.

## Requirements

- **Node.js** (any recent version) — download from <https://nodejs.org>
- A desktop browser (Chrome, Edge, Safari, Firefox)

> The app must be opened through the local server. Opening `index.html` by double-click
> does **not** work — the browser blocks the camera and file saving on `file://`.

## Run on Windows

1. Install Node.js if you don't have it.
2. Go to the folder `attendance` and double-click **`start.bat`**.
3. Your browser opens `http://localhost:3000` automatically.
4. Close the black server window to stop the app.

## Run on macOS

1. Install Node.js if you don't have it.
2. Open **Terminal** and type:

   ```bash
   cd /path/to/attendance
   node server.js
   ```

3. Your browser opens `http://localhost:3000` automatically.
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


