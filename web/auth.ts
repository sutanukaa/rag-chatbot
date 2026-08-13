import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

// reads AUTH_SECRET, AUTH_GOOGLE_ID/SECRET, AUTH_GITHUB_ID/SECRET from env
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub],
});
