import { AddPlacePage } from "@/components/AddPlacePage";

export default async function SharedNewPlacePage({
  params,
}: {
  params: Promise<{ shareId: string; date: string }>;
}) {
  const { shareId, date } = await params;
  return <AddPlacePage tripId={shareId} date={date} mode="shared" />;
}
