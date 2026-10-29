import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rev & Wreck",
  description:
    "A motorcycle combat racing game for the browser: race a coastal cliff road at sunset and fight your way through the pack.",
};

export const viewport: Viewport = {
  themeColor: "#1b1026",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden bg-night text-sand antialiased">{children}</body>
    </html>
  );
}
