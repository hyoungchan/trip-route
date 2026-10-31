import { TripOverviewPage } from "@/components/TripOverviewPage";

export default async function TripOverviewRoute({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  return <TripOverviewPage tripId={tripId} />;
}
