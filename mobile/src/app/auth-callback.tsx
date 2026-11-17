import { Redirect } from "expo-router";

// On Android the sign-in redirect (chaptos://auth-callback) can reach the router
// as well as the auth session that's waiting for it. The session handles the
// code (src/auth/dev-google.ts); here we only get out of the way.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
