import "server-only";

import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { typedSql } from "./server";

export type SessionType = "AUTHENTICATED" | "PASSWORD_CHANGE_REQUIRED";

export type SafeMember = {
  id: string;
  email: string;
  full_name: string;
  role: "ADMIN" | "MEMBER";
  must_change_password: boolean;
};

export type CurrentMember = SafeMember & {
  is_active: boolean;
};

type SessionClaims = {
  member_id: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  session_type: SessionType;
};

const AUTH_COOKIE_NAME = "office_wc_session";
const PASSWORD_CHANGE_COOKIE_NAME = "office_wc_password_change";

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing SESSION_SECRET.");
  }
  return new TextEncoder().encode(secret);
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  };
}

async function signSessionCookie(name: string, payload: SessionClaims, maxAgeSeconds: number) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.member_id)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(name, token, cookieOptions(maxAgeSeconds));
}

async function readSessionCookie(name: string): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(name)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const memberId = payload.member_id ?? payload.sub;
    const email = payload.email;
    const role = payload.role;
    const sessionType = payload.session_type;

    if (
      typeof memberId !== "string" ||
      typeof email !== "string" ||
      (role !== "ADMIN" && role !== "MEMBER") ||
      (sessionType !== "AUTHENTICATED" && sessionType !== "PASSWORD_CHANGE_REQUIRED")
    ) {
      return null;
    }

    return {
      member_id: memberId,
      email,
      role,
      session_type: sessionType
    };
  } catch {
    return null;
  }
}

async function fetchMemberBySession(session: SessionClaims): Promise<CurrentMember | null> {
  const rows = await typedSql<CurrentMember>`
    select id, email, full_name, role, is_active, must_change_password
    from members
    where id = ${session.member_id}
      and email = ${session.email}
      and role = ${session.role}
      and is_active = true
    limit 1
  `;

  return rows[0] ?? null;
}

export async function createAuthenticatedSession(member: {
  id: string;
  email: string;
  role: "ADMIN" | "MEMBER";
}) {
  await signSessionCookie(
    AUTH_COOKIE_NAME,
    {
      member_id: member.id,
      email: member.email,
      role: member.role,
      session_type: "AUTHENTICATED"
    },
    60 * 60 * 24 * 7
  );
}

export async function createPasswordChangeSession(member: {
  id: string;
  email: string;
  role: "ADMIN" | "MEMBER";
}) {
  await signSessionCookie(
    PASSWORD_CHANGE_COOKIE_NAME,
    {
      member_id: member.id,
      email: member.email,
      role: member.role,
      session_type: "PASSWORD_CHANGE_REQUIRED"
    },
    60 * 15
  );
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  cookieStore.delete(PASSWORD_CHANGE_COOKIE_NAME);
}

export async function getPasswordChangeSession() {
  const session = await readSessionCookie(PASSWORD_CHANGE_COOKIE_NAME);
  if (!session || session.session_type !== "PASSWORD_CHANGE_REQUIRED") {
    return null;
  }

  return fetchMemberBySession(session);
}

export async function getCurrentMember(): Promise<CurrentMember | null> {
  const authSession = await readSessionCookie(AUTH_COOKIE_NAME);
  if (!authSession || authSession.session_type !== "AUTHENTICATED") {
    return null;
  }

  const passwordChangeSession = await readSessionCookie(PASSWORD_CHANGE_COOKIE_NAME);
  if (passwordChangeSession?.session_type === "PASSWORD_CHANGE_REQUIRED") {
    return null;
  }

  return fetchMemberBySession(authSession);
}

export async function getAuthState() {
  const passwordChangeMember = await getPasswordChangeSession();
  if (passwordChangeMember) {
    return {
      member: null,
      passwordChangeMember
    };
  }

  const member = await getCurrentMember();
  return {
    member,
    passwordChangeMember: null
  };
}

export async function requirePasswordChangeSession() {
  const member = await getPasswordChangeSession();
  if (!member) {
    throw new Error("Password change required.");
  }

  return member;
}

export async function requireAuth() {
  const member = await getCurrentMember();
  if (!member) {
    throw new Error("Not authenticated.");
  }

  return member;
}

export async function requireAdmin() {
  const member = await requireAuth();
  if (member.role !== "ADMIN") {
    throw new Error("Admin access required.");
  }

  return member;
}
