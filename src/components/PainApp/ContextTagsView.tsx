import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Hash } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { extractTags, extractHashtags, getTagLabel, groupTagsByCategory, type ExtractedTag } from '@/lib/voice/tagExtractor';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface ContextTagsViewProps {
  onBack: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  mood: '😊 Stimmung',
  sleep: '😴 Schlaf',
  stress: '🧘 Stress',
  food: '🍽️ Ernährung',
  activity: '🏃 Aktivität',
  wellbeing: '💆 Wohlbefinden',
  other: '🏷️ Sonstiges',
};

const CATEGORY_COLORS: Record<string, string> = {
  mood: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
  sleep: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  stress: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
  food: 'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
  activity: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
  wellbeing: 'bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30',
  other: 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
};

export const ContextTagsView: React.FC<ContextTagsViewProps> = ({ onBack }) => {
  const isMobile = useIsMobile();

  // Kontext-Notizen laden
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['context-notes-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_notes')
        .select('*')
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .limit(500); // Letzte 500 Notizen
      
      if (error) throw error;
      return data || [];
    }
  });

  // Tags aus allen Notizen extrahieren
  const allTags = useMemo(() => {
    const extracted: Array<ExtractedTag & { noteId: string; noteText: string }> = [];
    
    notes.forEach(note => {
      const tags = extractTags(note.text);
      tags.forEach(tag => {
        extracted.push({
          ...tag,
          noteId: note.id,
          noteText: note.text
        });
      });
    });
    
    return extracted;
  }, [notes]);

  // Hashtags aus allen Notizen extrahieren
  const allHashtags = useMemo(() => {
    const hashtags: Record<string, number> = {};
    
    notes.forEach(note => {
      const tags = extractHashtags(note.text);
      tags.forEach(tag => {
        hashtags[tag] = (hashtags[tag] || 0) + 1;
      });
    });
    
    return Object.entries(hashtags)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [notes]);

  // Tag-Statistiken
  const tagStats = useMemo(() => {
    const stats: Record<string, { count: number; avgConfidence: number }> = {};
    
    allTags.forEach(({ tag, confidence }) => {
      if (!stats[tag]) {
        stats[tag] = { count: 0, avgConfidence: 0 };
      }
      stats[tag].count++;
      stats[tag].avgConfidence += confidence;
    });
    
    // Durchschnitt berechnen
    Object.keys(stats).forEach(tag => {
      stats[tag].avgConfidence = stats[tag].avgConfidence / stats[tag].count;
    });
    
    return Object.entries(stats)
      .map(([tag, { count, avgConfidence }]) => ({
        tag,
        count,
        avgConfidence,
        label: getTagLabel(tag)
      }))
      .sort((a, b) => b.count - a.count);
  }, [allTags]);

  // Nach Kategorie gruppieren
  const tagsByCategory = useMemo(() => {
    const grouped: Record<string, typeof tagStats> = {};
    
    tagStats.forEach(stat => {
      const tagData = allTags.find(t => t.tag === stat.tag);
      const category = tagData?.category || 'other';
      
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(stat);
    });
    
    return grouped;
  }, [tagStats, allTags]);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button 
          variant="ghost" 
          onClick={onBack} 
          className="p-2 hover:bg-secondary/80"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold flex-1">Kontext-Tags</h1>
        <Badge variant="outline" className="text-xs">
          {tagStats.length} Tags
        </Badge>
      </div>

      <div className={cn("max-w-4xl mx-auto p-4 space-y-4", isMobile && "px-3")}>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Lädt...</div>
        ) : tagStats.length === 0 ? (
          <EmptyState
            icon="🏷️"
            title="Noch keine Tags"
            description="Tags werden automatisch aus Ihren Kontext-Notizen erkannt. Erstellen Sie Notizen mit Informationen zu Stimmung, Schlaf, Aktivitäten etc."
          />
        ) : (
          <>
            {/* Top Tags */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Häufigste Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tagStats.slice(0, 10).map((stat) => {
                    const tagData = allTags.find(t => t.tag === stat.tag);
                    const category = tagData?.category || 'other';
                    
                    return (
                      <Badge
                        key={stat.tag}
                        variant="outline"
                        className={cn(
                          "text-sm py-1.5 px-3",
                          CATEGORY_COLORS[category]
                        )}
                      >
                        {stat.label} ({stat.count}x)
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Hashtags */}
            {allHashtags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="h-5 w-5" />
                    Hashtags
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {allHashtags.slice(0, 15).map((hashtag) => (
                      <Badge
                        key={hashtag.tag}
                        variant="secondary"
                        className="text-sm py-1.5 px-3"
                      >
                        {hashtag.tag} ({hashtag.count}x)
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tags nach Kategorie */}
            {Object.entries(tagsByCategory).map(([category, tags]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {CATEGORY_LABELS[category] || category}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {tags.map((stat) => (
                      <div
                        key={stat.tag}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">{stat.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {stat.count}x erkannt • {Math.round(stat.avgConfidence * 100)}% Konfidenz
                          </div>
                        </div>
                        <Badge 
                          variant="outline"
                          className={cn("ml-3", CATEGORY_COLORS[category])}
                        >
                          {stat.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Info */}
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  <strong>💡 Tipp:</strong> Tags werden automatisch aus Ihren Kontext-Notizen erkannt. 
                  Sie können auch Hashtags verwenden (z.B. #Stress, #Müde), um eigene Tags zu erstellen.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};