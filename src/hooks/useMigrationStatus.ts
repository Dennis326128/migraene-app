import { useQuery } from "@tanstack/react-query";
import { getMigrationStatus } from "@/services/migration.service";

/**
 * Hook to check migration status and provide recommendations
 */
export function useMigrationStatus() {
  return useQuery({
    queryKey: ['migration-status'],
    queryFn: getMigrationStatus,
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: false // Don't auto-refetch
  });
}

/**
 * Hook to determine if the user should see migration prompts
 */
export function useShouldShowMigration() {
  const { data: status } = useMigrationStatus();
  
  if (!status) return false;
  
  // Show migration if:
  // 1. There are legacy pain entries
  // 2. No events exist yet
  // 3. Or if events are significantly fewer than pain entries (incomplete migration)
  return status.needsMigration || 
         (status.painEntries > 0 && status.events < status.painEntries * 0.8);
}