import { OpenInvite } from "@/components/open-invite";
export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <OpenInvite initialPlanId={(await params).id} />;
}
