import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "discobardlogger",
  description: "Compare Warcraft encounter timelines against top performers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
