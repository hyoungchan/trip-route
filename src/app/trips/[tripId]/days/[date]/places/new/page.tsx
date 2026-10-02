import { AddPlacePage } from "@/components/AddPlacePage";

export default async function NewPlacePage({
  params,
}: {
  params: Promise<{ tripId: string; date: string }>;
}) {
  const { tripId, date } = await params;
  return <AddPlacePage tripId={tripId} date={date} />;
}
