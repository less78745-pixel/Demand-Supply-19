This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Buka dari HP / Android

Agar project ini bisa diakses dari HP lewat jaringan yang sama dengan laptop, jalankan:

```bash
npm run dev:mobile
```

Lalu cek IP laptop Anda (misalnya dari `ipconfig` di Windows) dan buka di HP:

```text
http://<IP-LAPTOP>:3000
```

Contoh:

```text
http://192.168.1.20:3000
```

Pastikan laptop dan HP tersambung ke Wi-Fi atau hotspot yang sama.

## Edit dari HP dengan editor yang tetap terintegrasi

Untuk pengalaman edit dari HP yang lebih dekat ke VS Code, Anda bisa menjalankan code-server di laptop:

```bash
npm install -g code-server
code-server --bind-addr 0.0.0.0:8080
```

Setelah itu buka di HP:

```text
http://<IP-LAPTOP>:8080
```

Dengan cara ini:
- kode tetap berada di laptop Anda
- edit bisa dilakukan lewat browser HP
- perubahan tetap tersimpan di repo lokal dan bisa dipush ke GitHub
- Vercel tetap menerima update setelah push ke GitHub

## GitHub dan Vercel

- Push perubahan ke GitHub untuk menyimpan history proyek.
- Vercel akan otomatis melakukan deploy bila repository terhubung.
- Untuk preview cepat dari HP, gunakan URL Vercel yang sudah terdeploy.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
