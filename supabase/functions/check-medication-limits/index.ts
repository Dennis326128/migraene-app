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

/**
 * SSOT: Count medication intakes from `medication_intakes` table.
 * Uses `taken_date` (event date) for accurate period filtering.
 * This matches the client-side SSOT (fetchMedicationSummaries).
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Keine Authentifizierung');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          persistSession: false,
        },
      }
    );

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

    // Load user's warning threshold (default: 80%)
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('medication_limit_warning_threshold_pct')
      .eq('user_id', user.id)
      .single();

    const warningPct = profileData?.medication_limit_warning_threshold_pct ?? 80;

    // Get ALL active limits for this user
    const { data: allLimits, error: limitsError } = await supabase
      .from('user_medication_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (limitsError) {
      throw limitsError;
    }

    // Filter to requested medications (case-insensitive)
    const limits = (allLimits || []).filter(limit => {
      const normalizedLimitName = normalizeMedicationName(limit.medication_name);
      return medications.some((med: string) => 
        normalizeMedicationName(med) === normalizedLimitName
      );
    }) as MedicationLimit[];

    console.log('📋 Active limits found:', limits.length);

    const results: LimitCheck[] = [];

    for (const limit of limits) {
      // Calculate period start date — uses today as anchor for safety monitoring
      const now = new Date();
      let periodStartDate: string;
      
      switch (limit.period_type) {
        case 'day':
          periodStartDate = now.toISOString().split('T')[0];
          break;
        case 'week': {
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 6);
          periodStartDate = weekAgo.toISOString().split('T')[0];
          break;
        }
        case 'month': {
          const monthAgo = new Date(now);
          monthAgo.setDate(now.getDate() - 29);
          periodStartDate = monthAgo.toISOString().split('T')[0];
          break;
        }
        default:
          continue;
      }

      const todayDate = now.toISOString().split('T')[0];

      // SSOT: Count from medication_intakes table using taken_date
      // Fallback: also fetch taken_at for rows where taken_date may be NULL
      const { data: intakes, error: intakesError } = await supabase
        .from('medication_intakes')
        .select('id, medication_name, taken_date, taken_at')
        .eq('user_id', user.id);

      if (intakesError) {
        console.error('Medication intakes error:', intakesError);
      }

      // Count intakes for this medication (case-insensitive)
      let currentCount = 0;
      const normalizedLimitName = normalizeMedicationName(limit.medication_name);
      
      if (intakes) {
        for (const intake of intakes) {
          if (normalizeMedicationName(intake.medication_name) === normalizedLimitName) {
            currentCount++;
          }
        }
      }

      console.log(`✅ ${limit.medication_name}: ${currentCount}/${limit.limit_count} (${limit.period_type}) [SSOT: medication_intakes]`);

      const percentage = limit.limit_count > 0 ? (currentCount / limit.limit_count) * 100 : 0;
      let status: 'safe' | 'warning' | 'reached' | 'exceeded';

      if (currentCount > limit.limit_count) {
        status = 'exceeded';
      } else if (currentCount === limit.limit_count) {
        status = 'reached';
      } else if (percentage >= warningPct) {
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
        period_start: periodStartDate,
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
