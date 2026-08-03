import type { CSSProperties } from "react";
import { theme } from "../../lib/theme";

export const metadata = { title: "Admin sign in — CY360 Sales" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
};

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "10px 12px",
  fontSize: 15,
  fontFamily: theme.font.body,
  color: theme.ink,
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, maxWidth: "100%", padding: 32, borderRadius: theme.radius.card, border: `1px solid ${theme.border}`, background: theme.surface, boxShadow: "0 1px 3px rgba(22,24,29,0.08)" }}>
        <h1 style={{ fontFamily: theme.font.display, fontSize: 24, color: theme.clientDeep, margin: "0 0 4px" }}>CY360 Sales — Admin</h1>
        <p style={{ color: theme.textSecondary, fontSize: 14, margin: "0 0 24px" }}>Sign in to manage locations, uploads and manager accounts.</p>
        {error && (
          <p role="alert" style={{ color: theme.down, background: "#FBEAEA", borderRadius: 8, padding: "8px 12px", fontSize: 13, margin: "0 0 16px" }}>
            {ERROR_MESSAGES[error] ?? "Couldn't sign you in — try again."}
          </p>
        )}
        <form method="POST" action="/api/admin/login">
          <label style={{ display: "block", margin: "0 0 16px", fontSize: 13, color: theme.textTertiary }}>
            Email
            <input type="email" name="email" required autoComplete="email" style={inputStyle} />
          </label>
          <label style={{ display: "block", margin: "0 0 24px", fontSize: 13, color: theme.textTertiary }}>
            Password
            <input type="password" name="password" required autoComplete="current-password" style={inputStyle} />
          </label>
          <button
            type="submit"
            style={{
              width: "100%", padding: "11px 0", fontSize: 15, fontWeight: 600, color: "#FFFFFF",
              background: theme.clientAccent, border: "none", borderRadius: theme.radius.pill, cursor: "pointer",
            }}
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
