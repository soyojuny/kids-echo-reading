import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/shared/components/PwaRegister";

export const metadata: Metadata = {
  title: "Kids Echo Reading",
  description: "Tablet-first PWA for guided echo reading.",
  applicationName: "Kids Echo Reading",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
