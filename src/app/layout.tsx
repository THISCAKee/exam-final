import type { Metadata } from "next";
import { Anuphan } from "next/font/google";
import "./globals.css";

const anuphan = Anuphan({
  variable: "--font-anuphan",
  subsets: ["thai", "latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
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
    <html lang="th">
      <body className={`${anuphan.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
