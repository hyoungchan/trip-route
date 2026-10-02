import { TripDetailPage } from "@/components/TripDetailPage";

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  return <TripDetailPage tripId={shareId} mode="shared" />;
}
