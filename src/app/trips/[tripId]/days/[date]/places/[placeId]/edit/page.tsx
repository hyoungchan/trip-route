import { AddPlacePage } from "@/components/AddPlacePage";

export default async function EditPlacePage({
  params,
}: {
  params: Promise<{ tripId: string; date: string; placeId: string }>;
}) {
  const { tripId, date, placeId } = await params;
  return <AddPlacePage tripId={tripId} date={date} placeId={placeId} />;
}
