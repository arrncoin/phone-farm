# Farmdroid Android Emulator Dashboard

Dashboard React dengan backend Express/WebSocket untuk mengelola Android Emulator lewat ADB.
Runtime Docker memakai image resmi Android 15 (API 35) Google Play x86_64, memerlukan Linux dan
KVM. Dashboard mendukung boot/shutdown/restart emulator, touch/swipe/key/text, screenshot live,
informasi aplikasi TikTok/YouTube, dan membuka halaman aplikasinya di Play Store.

## Batasan perangkat

- Ini Android Emulator virtual, bukan perangkat Pixel 7 Pro asli. "Pixel 7 Pro" hanya profil nama
  dan tampilan AVD 720x1560 @ 280dpi; CPU virtual x86_64, bukan Tensor G2. Bukan profil hardware,
  sertifikasi CTS, atau identitas perangkat Pixel.
- Image Google Play menyediakan Play Store/Play Services. Login Google dan instal TikTok/YouTube
  dilakukan manual di layar masing-masing emulator. Direktori data setiap AVD disimpan terpisah.
- AVD pertama dijalankan otomatis. Tombol Start All menjalankan slot tambahan hingga batas kapasitas.
  Kapasitas merupakan estimasi, bukan jaminan performa: KVM wajib; default menyisakan 4 GB RAM dan
  2 core untuk host, menghitung 2 GB overhead serta 2 vCPU per emulator, dan dibatasi `MAX_DEVICES`.
- Default GPU `swiftshader` menggunakan rendering software. Compose belum meneruskan GPU NVIDIA/AMD
  host ke container; `EMULATOR_GPU_MODE=host` sendiri tidak mengonfigurasi GPU passthrough.
- Logcat live belum tersedia. Audit logs dan sebagian statistik operasional tidak disimpan permanen.
- Build container, boot pertama, Play Store, dan input ADB harus diuji pada Linux VPS dengan KVM;
  lingkungan pengembangan Windows tanpa Docker/KVM tidak dapat memvalidasi runtime emulator.

## Persyaratan VPS

- Linux x86_64, Docker Engine dan Docker Compose v2.
- Virtualisasi hardware aktif di VPS (nested virtualization jika VPS berjalan di atas hypervisor).
- `/dev/kvm` tersedia dan dapat diakses oleh container. Atur `KVM_GID` sesuai group ID KVM host.
- Google Play x86_64 image memerlukan ruang disk dan RAM cukup; sediakan ruang tambahan untuk setiap
  AVD di volume persisten. Gunakan capacity endpoint/dashboard sebagai perkiraan awal, lalu ukur
  pemakaian CPU/RAM sebenarnya sebelum menaikkan jumlah perangkat.

## Konfigurasi

Salin `.env.example` menjadi `.env`, lalu tetapkan password dan secret unik:

```sh
cp .env.example .env
openssl rand -base64 32
openssl rand -base64 24
```

Masukkan hasilnya masing-masing ke `SESSION_SECRET` dan `DASHBOARD_PASSWORD`. Jangan commit `.env`.
`KVM_GID` default `108` umum pada sebagian distro; verifikasi dengan `getent group kvm` di host.
Atur `MAX_DEVICES`, `EMULATOR_MEMORY_MB`, `EMULATOR_VCPUS`, dan `EMULATOR_GPU_MODE` sesuai VPS.

## Menjalankan

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f web-control
```

Dashboard lokal tersedia di `http://localhost:8080` (Compose mengikat ke loopback). Untuk akses
remote, gunakan reverse proxy TLS yang dikelola sendiri atau profil Ngrok opsional:

```sh
docker compose --profile remote up -d
docker compose logs ngrok-gateway
```

Autentikasi dashboard tetap wajib. Jangan publikasikan port dashboard tanpa TLS/proxy dan password
yang kuat. Data emulator tersimpan pada named volume `android-device-data`; buat backup volume
sebelum pemeliharaan yang berisiko menghapus data.

## Menggunakan perangkat

1. Masuk dengan `DASHBOARD_PASSWORD`.
2. Mulai perangkat pertama atau pilih Start All untuk slot yang tersedia.
3. Tunggu Android selesai boot; boot awal dapat lebih lama karena membuat AVD.
4. Buka layar perangkat, masuk ke Play Store, login, lalu instal TikTok dan/atau YouTube.
5. Gunakan kontrol layar; sesi dan data tiap AVD disimpan pada direktori terpisah.

Untuk kembali menghentikan stack tanpa menghapus data:

```sh
docker compose stop
```

`docker compose down` juga mempertahankan named volume kecuali diberi opsi penghapusan volume.

## Pengembangan dan validasi

```sh
bun install --frozen-lockfile
bun run dev
npm test
npm run lint
npm run build
```

Runtime emulator hanya diaktifkan dalam konfigurasi Compose; server pengembangan lokal secara
default tetap menggunakan simulator UI agar dapat dijalankan tanpa KVM.
