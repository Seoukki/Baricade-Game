# 🚧 Barricade Game Online

Real-time 2-player strategic board game built with **Next.js** + **Supabase**.

---

## Tech Stack

| Layer    | Tech                              |
|----------|-----------------------------------|
| Frontend | Next.js 14 (Pages Router)         |
| Styling  | Tailwind CSS                      |
| Database | Supabase (PostgreSQL)             |
| Realtime | Supabase Realtime (Postgres CDC)  |
| Deploy   | Vercel                            |

---

## How to Play

1. **Bergerak** — Pindahkan bidak 1 langkah ke sel yang berdekatan
2. **Pasang Rintangan** — Klik pada garis antar sel untuk memasang rintangan
3. **Menang** — Jadilah yang pertama mencapai baris rumah lawan (Merah → baris 9, Biru → baris 1)

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/yourname/barricade-game.git
cd barricade-game
npm install
```

### 2. Supabase Setup

1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **SQL Editor**
3. Jalankan seluruh isi `supabase/schema.sql`
4. Di Supabase Dashboard → **Database → Replication**, pastikan tabel `rooms`, `players`, dan `game_states` sudah masuk ke publikasi realtime

### 3. Environment Variables

Salin `.env.example` ke `.env.local`:

```bash
cp .env.example .env.local
```

Isi dengan kredensial Supabase kamu:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Nilai ini ada di: Supabase Dashboard → **Settings → API**

### 4. Run Locally

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

---

## Deploy ke Vercel

1. Push repo ke GitHub
2. Import ke [vercel.com](https://vercel.com)
3. Di Vercel project settings, tambahkan environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

---

## Supabase Realtime — Troubleshooting

Jika update tidak muncul real-time:

1. Pastikan tabel sudah ditambahkan ke realtime publication:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
   ALTER PUBLICATION supabase_realtime ADD TABLE players;
   ALTER PUBLICATION supabase_realtime ADD TABLE game_states;
   ```
2. Di Dashboard: Database → Replication → centang ketiga tabel
3. Pastikan Row Level Security (RLS) **disabled** atau ada policy yang mengizinkan select

---

## Project Structure

```
barricade-game/
├── pages/
│   ├── index.js          ← Landing page (buat/masuk room)
│   ├── lobby/[code].js   ← Ruang tunggu real-time
│   └── game/[code].js    ← Board game utama
├── components/
│   └── GameBoard.jsx     ← SVG board interaktif
├── lib/
│   ├── supabase.js       ← Supabase client
│   └── gameLogic.js      ← Aturan game, validasi, helpers
├── styles/
│   └── globals.css       ← Tailwind + custom styles
└── supabase/
    └── schema.sql        ← Database schema
```

---

## Game Board

Board 9×9 interseksi (labeled A–I, 1–9).

- **Merah** mulai di E1 (tengah atas), target: baris 9
- **Biru** mulai di E9 (tengah bawah), target: baris 1
- Rintangan dipasang pada garis antar titik (edges)
- Rintangan memblokir jalur pergerakan

---

Made with ❤️ using Next.js + Supabase
