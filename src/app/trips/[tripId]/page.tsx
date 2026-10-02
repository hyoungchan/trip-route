import { TripDetailPage } from "@/components/TripDetailPage";

export default async function TripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  return <TripDetailPage tripId={tripId} />;
}
