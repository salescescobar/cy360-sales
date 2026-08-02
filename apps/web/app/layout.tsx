export const metadata = { title: "CY360 Sales" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ fontFamily: "Arial, sans-serif", margin: 40 }}>{children}</body></html>);
}
