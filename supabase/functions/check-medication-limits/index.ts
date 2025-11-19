import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to normalize medication names for comparison
const normalizeMedicationName = (name: string): string => {
  return name.trim().toLowerCase();
};

interface MedicationLimit {
  id: string;
  medication_name: string;
  limit_count: number;
  period_type: 'day' | 'week' | 'month';
  is_active: boolean;
}

interface LimitCheck {
  medication_name: string;
  current_count: number;
  limit_count: number;
  period_type: string;
  percentage: number;
  status: 'safe' | 'warning' | 'reached' | 'exceeded';
  period_start: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract JWT token FIRST
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Keine Authentifizierung');
    }

    // Create Supabase client WITH the JWT token in the auth context
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader, // ✅ Set auth header for ALL requests
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    // Verify user (now with proper auth context)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Ungültiger Nutzer');
    }

    const { medications } = await req.json();
    if (!medications || !Array.isArray(medications)) {
      throw new Error('Medikamentenliste erforderlich');
    }

    console.log('🔍 Checking medications:', medications);
    console.log('👤 For user:', user.id);

    // Get ALL active limits for this user first
    const { data: allLimits, error: limitsError } = await supabase
      .from('user_medication_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (limitsError) {
      throw limitsError;
    }

    // Filter client-side to match requested medications (case-insensitive, trimmed)
    const limits = (allLimits || []).filter(limit => {
      const normalizedLimitName = normalizeMedicationName(limit.medication_name);
      return medications.some((med: string) => 
        normalizeMedicationName(med) === normalizedLimitName
      );
    }) as MedicationLimit[];

    console.log('📋 Active limits found:', limits.length);
    if (limits.length > 0) {
      for (const limit of limits) {
        console.log(`  - ${limit.medication_name}: ${limit.limit_count}/${limit.period_type}`);
      }
    }

    const results: LimitCheck[] = [];

    for (const limit of limits as MedicationLimit[]) {
      // Calculate period start date
      const now = new Date();
      let periodStart: Date;
      
      switch (limit.period_type) {
        case 'day':
          periodStart = new Date(now);
          periodStart.setHours(0, 0, 0, 0);
          break;
        case 'week':
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - 7);
          break;
        case 'month':
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - 30);
          break;
        default:
          continue;
      }

      // Count current usage from pain_entries
      console.log(`📊 Counting ${limit.medication_name} from ${periodStart.toISOString()}`);
      
      // Count current usage from pain_entries
      const { data: painEntries, error: entriesError } = await supabase
        .from('pain_entries')
        .select('medications, timestamp_created')
        .eq('user_id', user.id)
        .gte('timestamp_created', periodStart.toISOString())
        .not('medications', 'is', null);

      if (entriesError) {
        console.error('Pain entries error:', entriesError);
      }

      // Calculate total usage from pain_entries (case-insensitive, trimmed)
      let currentCount = 0;
      const normalizedLimitName = normalizeMedicationName(limit.medication_name);
      
      if (painEntries) {
        for (const entry of painEntries) {
          if (entry.medications) {
            // Count each occurrence of this medication in the array
            const medicationCount = entry.medications.filter((med: string) => 
              normalizeMedicationName(med) === normalizedLimitName
            ).length;
            currentCount += medicationCount;
          }
        }
      }

      console.log(`✅ ${limit.medication_name}: ${currentCount}/${limit.limit_count} (${limit.period_type})`);

      const percentage = (currentCount / limit.limit_count) * 100;
      let status: 'safe' | 'warning' | 'reached' | 'exceeded';

      if (currentCount > limit.limit_count) {
        status = 'exceeded';
      } else if (currentCount === limit.limit_count) {
        status = 'reached';
      } else if (percentage >= 90) {
        status = 'warning';
      } else {
        status = 'safe';
      }

      results.push({
        medication_name: limit.medication_name,
        current_count: currentCount,
        limit_count: limit.limit_count,
        period_type: limit.period_type,
        percentage: Math.round(percentage),
        status,
        period_start: periodStart.toISOString()
      });
    }

    return new Response(
      JSON.stringify(results),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error checking medication limits:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});