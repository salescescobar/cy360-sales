const form = new URLSearchParams();
form.set("email", `test-${Date.now()}@example.com`);
form.set("password", "password123");
form.set("location", "orlando");

const res = await fetch("http://localhost:3000/api/signup", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
  redirect: "manual",
});
console.log("status", res.status);
console.log("location header", res.headers.get("location"));
