// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

// простой re-export
export const { GET, POST } = handlers;
