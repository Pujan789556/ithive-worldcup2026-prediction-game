import { DashboardShell, LoginCard, PasswordChangeCard } from "@/components/dashboard";
import { fetchDashboardData } from "@/lib/game";
import { getAuthState } from "@/lib/auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function queryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === "string" ? value : null;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const auth = await getAuthState();

  if (auth.passwordChangeMember) {
    return (
      <PasswordChangeCard
        member={auth.passwordChangeMember}
        errorMessage={queryValue(resolvedSearchParams, "password_error")}
      />
    );
  }

  if (!auth.member) {
    return <LoginCard errorMessage={queryValue(resolvedSearchParams, "auth_error")} />;
  }

  const data = await fetchDashboardData();

  return (
    <DashboardShell
      data={data}
      profileError={queryValue(resolvedSearchParams, "profile_error")}
      predictionError={queryValue(resolvedSearchParams, "prediction_error")}
    />
  );
}
