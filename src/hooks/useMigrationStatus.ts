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
  
  // Only show migration if there are actual legacy pain entries to migrate
  // Never show for empty systems
  return status.painEntries > 0 && (
    status.needsMigration || 
    status.events < status.painEntries * 0.8
  );
}