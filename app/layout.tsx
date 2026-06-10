import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northwind Bank",
  description: "Mock fintech app with an AI assistant — Harness FME demo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
