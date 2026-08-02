export const metadata = { title: "Sign in — CY360 Sales" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main>
      <h1>CY360 Sales</h1>
      <p>Sign in to your location&apos;s dashboard.</p>
      {error && <p role="alert">{ERROR_MESSAGES[error] ?? "Couldn't sign you in — try again."}</p>}
      <form method="POST" action="/api/login">
        <label style={{ display: "block", margin: "8px 0" }}>
          Email
          <br />
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label style={{ display: "block", margin: "8px 0" }}>
          Password
          <br />
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
      </form>
      <p>
        Need an account? <a href="/signup">Create one</a>.
      </p>
    </main>
  );
}
