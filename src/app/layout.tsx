import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tally Karo Connector",
  description: "Connector",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>{children}</body>
    </html>
  );
}
