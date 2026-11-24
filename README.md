# wa-pair-spam

Flooder kode pairing WhatsApp linked-device. Menembak endpoint pair-device asli
via Baileys, mengambil kode, lalu membuang socket tanpa menyelesaikan pairing.

## Pasang (Termux, F-Droid)

    pkg update && pkg upgrade
    pkg install nodejs-lts git python make clang pkg-config libvips binutils tmux termux-api
    npm install
    SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install sharp --build-from-source
    chmod +x run.sh

## Pakai

    termux-wake-lock
    ./run.sh 08123456789 200

## Fase

| Fase | Perintah |
|---|---|
| Uji | ./run.sh NOMOR 30 |
| Panas | ./run.sh NOMOR 150 |
| Banjir | ./run.sh NOMOR 600 |

## Proxy

Salin proxies.example.txt ke proxies.txt, isi, lalu jalankan dengan --proxy proxies.txt.

## Batasan

Tidak ada kuota resmi dari WhatsApp. 429 adalah respons yang dicari, bukan kegagalan.
Banned berjenjang: rate-limit -> blokir sementara -> permanen, dan permanen butuh
pengulangan lintas hari.