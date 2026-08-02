import { allLocations } from "../lib/locations";

export const metadata = { title: "Create account — CY360 Sales" };

const ERROR_MESSAGES: Record<string, string> = {
  email_taken: "An account with that email already exists. Sign in instead.",
  invalid: "Please fill in a valid email, a password of at least 8 characters, and pick a location.",
  server_error: "Something went wrong creating your account. Please try again.",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const locations = allLocations().filter(l => l.active);
  return (
    <main>
      <h1>Create your manager account</h1>
      <p>One account per location manager.</p>
      {error && <p role="alert">{ERROR_MESSAGES[error] ?? "Couldn't create your account — try again."}</p>}
      <form method="POST" action="/api/signup">
        <label style={{ display: "block", margin: "8px 0" }}>
          Email
          <br />
          <input type="email" name="email" required autoComplete="email" />
        </label>
        <label style={{ display: "block", margin: "8px 0" }}>
          Password
          <br />
          <input type="password" name="password" required minLength={8} autoComplete="new-password" />
        </label>
        <fieldset style={{ margin: "8px 0" }}>
          <legend>Location</legend>
          {locations.map(l => (
            <label key={l.slug} style={{ display: "block", margin: "4px 0" }}>
              <input type="radio" name="location" value={l.slug} required /> {l.name}
            </label>
          ))}
        </fieldset>
        <button type="submit">Create account</button>
      </form>
      <p>
        Already have an account? <a href="/login">Sign in</a>.
      </p>
    </main>
  );
}
