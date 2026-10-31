import { TripOverviewPage } from "@/components/TripOverviewPage";

export default async function SharedTripOverviewRoute({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <TripOverviewPage tripId={shareId} mode="shared" />;
}
