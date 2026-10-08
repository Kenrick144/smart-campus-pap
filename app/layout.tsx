import type { Metadata } from "next";
import PwaRegister from "./pwa-register";
import "./globals.css";
import "./modern.css";

export const metadata: Metadata = {
  title: "Smart Campus | Gestão escolar",
  description: "Plataforma de gestão escolar, assiduidade e equipamentos do Smart Campus.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
