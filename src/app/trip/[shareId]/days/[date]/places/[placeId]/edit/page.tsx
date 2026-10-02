import { AddPlacePage } from "@/components/AddPlacePage";

export default async function SharedEditPlacePage({
  params,
}: {
  params: Promise<{ shareId: string; date: string; placeId: string }>;
}) {
  const { shareId, date, placeId } = await params;
  return <AddPlacePage tripId={shareId} date={date} placeId={placeId} mode="shared" />;
}
