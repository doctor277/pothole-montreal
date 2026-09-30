import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pothole MTL Admin",
  description: "Pothole MTL moderation dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-slate-50">
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
