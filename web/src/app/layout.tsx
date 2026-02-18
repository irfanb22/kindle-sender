import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "q2kindle",
  description: "Queue articles and send them to your Kindle as formatted ebooks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
