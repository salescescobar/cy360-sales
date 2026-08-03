export const metadata = { title: "Page not found — CY360 Sales" };

/** Catches any URL that doesn't match a route (including deep-linked nonsense under
 * /dashboard/[location]/...) so a manager or admin always lands on branded chrome,
 * never Next.js's default unstyled 404. */
export default function NotFound() {
  return (
    <main>
      <h1>CY360 Sales</h1>
      <p>We couldn&apos;t find that page.</p>
      <p><a href="/">Go to your dashboard</a> or <a href="/login">sign in</a>.</p>
    </main>
  );
}
