import { theme } from "./lib/theme";

export const metadata = { title: "CY360 Sales" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: theme.font.body, margin: 40, color: theme.ink, background: theme.surface }}>
        {children}
      </body>
    </html>
  );
}
