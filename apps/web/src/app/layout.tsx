import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clever Agents",
  description: "Agentes de IA para atendimento no WhatsApp",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Painted from the cookie so there is no flash of the wrong theme.
  const theme =
    (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";

  return (
    <html lang="pt-BR" data-theme={theme}>
      <body>
        {children}
        <Toaster theme={theme} position="top-center" richColors />
      </body>
    </html>
  );
}
