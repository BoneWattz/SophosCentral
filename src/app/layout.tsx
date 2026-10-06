import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sophos Device Dashboard",
  description: "Devices enrolled in Sophos Central",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
