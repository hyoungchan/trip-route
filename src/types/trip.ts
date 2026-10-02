export type PlaceKind = "visit" | "airport" | "lodging" | "home";

export type Place = {
  id: string;
  name: string;
  address: string;
  date: string;
  kind?: PlaceKind;
  category?: string;
  latitude?: number;
  longitude?: number;
  stayMinutes?: number;
  travelMinutesToNext?: number;
  travelMode?: "manual" | "drive" | "bus" | "subway" | "walk";
  travelDistanceKm?: number;
  travelTransit?: TravelTransitLeg[];
  travelTransitSteps?: TravelTransitStep[];
};

export type TravelTransitLeg = {
  vehicleType?: string;
  vehicleName?: string;
  lineName?: string;
  lineShortName?: string;
  headsign?: string;
  departureStop?: string;
  arrivalStop?: string;
  stopCount?: number;
};

export type TravelTransitStep = {
  type: "WALK" | "TRANSIT";
  durationMinutes: number;
  fromName?: string;
  toName?: string;
  transit?: TravelTransitLeg;
};

export type Trip = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  stopCount: number;
  places?: Place[];
  dayStartTimes?: Record<string, string>;
};
