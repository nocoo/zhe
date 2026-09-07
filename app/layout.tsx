import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import Script from "next/script";
import { BasaltProviders } from "@/components/basalt-providers";
import { Toaster } from "@/components/ui/sonner";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.AUTH_URL || "https://zhe.to"),
  title: "zhe - 短链接服务",
  description: "A minimalist URL shortener service",
  openGraph: {
    title: "zhe - 短链接服务",
    description: "A minimalist URL shortener service",
    type: "website",
  },
  // icon.png, apple-icon.png, opengraph-image.png in app/ are
  // auto-discovered by Next.js file-based metadata convention
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} ${dmSans.variable} antialiased`}>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <BasaltProviders>
          {children}
          <Toaster />
        </BasaltProviders>
      </body>
    </html>
  );
}
