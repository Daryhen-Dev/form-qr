import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans, Merriweather } from "next/font/google";
import "./globals.css";
import { AccessProvider } from "@/components/access/access-provider";
import { cn } from "@/lib/utils";

const merriweatherHeading = Merriweather({subsets:['latin'],variable:'--font-heading'});

const dmSans = DM_Sans({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Iniciar sesión | form-qr",
  description: "Inicie sesión para acceder a form-qr.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", dmSans.variable, merriweatherHeading.variable)}
    >
      <body className="min-h-full flex flex-col">
        <AccessProvider>{children}</AccessProvider>
      </body>
    </html>
  );
}
