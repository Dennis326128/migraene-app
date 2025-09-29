import { useQuery } from "@tanstack/react-query";
import { getWeatherTimelineData, WeatherTimelineData } from "../api/weatherTimeline.api";

export function useWeatherTimeline(
  from?: string,
  to?: string,
  includePassive: boolean = true
) {
  return useQuery({
    queryKey: ['weather-timeline', from, to, includePassive],
    queryFn: () => getWeatherTimelineData(from!, to!, includePassive),
    enabled: !!(from && to),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export type { WeatherTimelineData };