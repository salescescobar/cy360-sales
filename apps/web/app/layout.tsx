export const metadata = { title: "Review Queue" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ fontFamily: "Arial, sans-serif", margin: 40 }}>{children}</body></html>);
}
