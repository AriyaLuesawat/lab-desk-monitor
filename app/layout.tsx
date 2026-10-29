import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lab Desk Monitor",
  description: "Shared laboratory desk status and test reservations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
