import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronDown, ChevronUp, Trash2, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { VoiceNoteEditModal } from './VoiceNoteEditModal';
import { EmptyState } from '@/components/ui/empty-state';

interface VoiceNote {
  id: string;
  text: string;
  occurred_at: string;
  captured_at: string;
  stt_confidence: number | null;
}

interface VoiceNotesListProps {
  onNavigate?: (view: string) => void;
}

export function VoiceNotesList({ onNavigate }: VoiceNotesListProps = {}) {
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [search, setSearch] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [editingNote, setEditingNote] = useState<VoiceNote | null>(null);

  // Lade Notizen
  useEffect(() => {
    loadNotes();

    // Listener für neue Notizen
    const handleNewNote = () => loadNotes();
    window.addEventListener('voice-note-saved', handleNewNote);
    return () => window.removeEventListener('voice-note-saved', handleNewNote);
  }, []);

  async function loadNotes() {
    setIsLoading(true);
    try {
      let query = supabase
        .from('voice_notes')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(100);

      // Suche via Full-Text-Search
      if (search.trim()) {
        query = query.textSearch('text_fts', search, {
          type: 'websearch',
          config: 'german'
        });
      }

      const { data, error } = await query;
      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('❌ Fehler beim Laden:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Suche triggern mit Debounce
  useEffect(() => {
    const timer = setTimeout(() => loadNotes(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Soft-Delete
  async function deleteNote(id: string) {
    const { error } = await supabase
      .from('voice_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setNotes(notes.filter(n => n.id !== id));
    }
  }

  // Gruppierung nach Tag
  const groupedNotes = notes.reduce((acc, note) => {
    const berlinDate = toZonedTime(new Date(note.occurred_at), 'Europe/Berlin');
    const dateKey = format(berlinDate, 'yyyy-MM-dd', { locale: de });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(note);
    return acc;
  }, {} as Record<string, VoiceNote[]>);

  return (
    <div className="space-y-4">
      {/* Suche */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Suche in Notizen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Lädt...</div>
      ) : Object.keys(groupedNotes).length === 0 ? (
        search.trim() ? (
          <EmptyState
            icon="🔍"
            title="Keine Notizen gefunden"
            description="Versuchen Sie andere Suchbegriffe oder löschen Sie die Suche."
          />
        ) : (
          <EmptyState
            icon="🎙️"
            title="Noch keine Voice-Notizen"
            description="Verwenden Sie den Voice-Eingabe Button im Hauptmenü, um Ihre ersten Notizen aufzunehmen."
            action={onNavigate ? {
              label: "Zum Hauptmenü",
              onClick: () => onNavigate('menu'),
              variant: "default"
            } : undefined}
          />
        )
      ) : (
        Object.entries(groupedNotes).map(([dateKey, dayNotes]) => (
          <div key={dateKey} className="space-y-2">
            <h3 className="font-semibold text-sm">
              {format(new Date(dateKey), 'EEEE, d. MMMM yyyy', { locale: de })}
            </h3>
            {dayNotes.map(note => {
              const isExpanded = expandedNotes.has(note.id);
              const berlinTime = toZonedTime(new Date(note.occurred_at), 'Europe/Berlin');
              const shortText = note.text.slice(0, 100);
              const needsExpansion = note.text.length > 100;

              return (
                <Card key={note.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">
                            {format(berlinTime, 'HH:mm', { locale: de })} Uhr
                          </span>
                          {note.stt_confidence && (
                            <span className="text-xs text-muted-foreground">
                              ({Math.round(note.stt_confidence * 100)}%)
                            </span>
                          )}
                        </div>
                        <p className="text-sm break-words">
                          {isExpanded ? note.text : shortText}
                          {!isExpanded && needsExpansion && '...'}
                        </p>
                        {needsExpansion && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newSet = new Set(expandedNotes);
                              if (isExpanded) {
                                newSet.delete(note.id);
                              } else {
                                newSet.add(note.id);
                              }
                              setExpandedNotes(newSet);
                            }}
                            className="mt-1 h-6 px-2"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3 mr-1" />
                                Weniger
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3 mr-1" />
                                Mehr
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingNote(note)}
                          title="Bearbeiten"
                        >
                          <Edit className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Notiz wirklich löschen?')) {
                              deleteNote(note.id);
                            }
                          }}
                          title="Löschen"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}

      {/* Edit Modal */}
      <VoiceNoteEditModal
        note={editingNote}
        open={!!editingNote}
        onClose={() => setEditingNote(null)}
        onSaved={() => {
          loadNotes();
          setEditingNote(null);
        }}
      />
    </div>
  );
}
