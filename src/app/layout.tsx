import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const anuphan = localFont({
  src: "./fonts/Anuphan-Variable.ttf",
  variable: "--font-anuphan",
  weight: "100 700",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ระบบสอบออนไลน์",
  description: "ระบบสอบออนไลน์สำหรับนักศึกษา",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={anuphan.variable}>
      <body className={`${anuphan.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
