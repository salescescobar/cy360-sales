import { theme } from "./lib/theme";

export const metadata = { title: "CY360 Sales" };

/**
 * Base styles for every plain HTML tag (a, button, table, input…) so no screen falls back to
 * browser defaults — blue underlined links, unstyled tables — even before a component adds
 * its own inline styles. Sourced only from theme.ts tokens; nothing here hardcodes a colour.
 */
const globalCss = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${theme.font.body}; color: ${theme.ink}; background: ${theme.surfaceMuted}; }
  main { max-width: 1120px; margin: 0 auto; padding: ${theme.space(10)}; }
  h1, h2, h3 { font-family: ${theme.font.display}; color: ${theme.clientDeep}; margin: 0 0 ${theme.space(2)}; font-weight: 700; }
  a { color: ${theme.clientAccent}; text-decoration: none; font-weight: 600; }
  a:hover, a:focus-visible { text-decoration: underline; }
  button { font-family: ${theme.font.body}; font-size: 14px; color: ${theme.ink}; background: ${theme.surface}; border: 1px solid ${theme.border}; border-radius: ${theme.radius.pill}; padding: 8px 16px; cursor: pointer; }
  button:hover { border-color: ${theme.clientAccent}; }
  table { border-collapse: collapse; width: 100%; font-feature-settings: ${theme.numericFeatures}; }
  th { text-align: left; padding: 8px; font-weight: 400; font-size: 13px; color: ${theme.textSecondary}; border-bottom: 1px solid ${theme.border}; }
  td { padding: 8px; border-bottom: 1px solid ${theme.border}; }
  input, select {
    font-family: ${theme.font.body}; font-size: 14px; color: ${theme.ink}; background: ${theme.surface};
    border: 1px solid ${theme.border}; border-radius: 6px; padding: 6px 10px;
  }
  input:focus, select:focus, button:focus-visible { outline: 2px solid ${theme.clientAccentSoft}; outline-offset: 1px; }
  label { font-size: 13px; color: ${theme.textTertiary}; }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
