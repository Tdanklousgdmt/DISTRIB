import { handlers } from "@/lib/auth";

// Route catch-all Auth.js : /api/auth/signin, /callback, /session, etc.
export const { GET, POST } = handlers;
