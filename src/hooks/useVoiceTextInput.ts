/**
 * Hook for Voice + Text Input with cursor-aware merging
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { createSttProvider, isSttAvailable, type SttProvider } from '@/lib/voice/sttProvider';

export interface UseVoiceTextInputOptions {
  language?: string;
  onError?: (error: string) => void;
}

export interface UseVoiceTextInputReturn {
  // Text state
  text: string;
  setText: (text: string) => void;
  interimText: string;
  
  // Recording state
  isRecording: boolean;
  isSupported: boolean;
  error: string | null;
  confidence: number | null;
  usedVoice: boolean;
  
  // Actions
  startRecording: () => void;
  stopRecording: () => void;
  clear: () => void;
  
  // Textarea ref for cursor management
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  
  // Source determination
  getSource: () => 'voice' | 'manual' | 'mixed';
}

export function useVoiceTextInput(options: UseVoiceTextInputOptions = {}): UseVoiceTextInputReturn {
  const { language = 'de-DE', onError } = options;
  
  const [text, setText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const providerRef = useRef<SttProvider | null>(null);
  const cursorPositionRef = useRef<number | null>(null);
  
  const isSupported = isSttAvailable();

  // Track typing
  const handleTextChange = useCallback((newText: string) => {
    if (!isRecording && newText !== text) {
      setHasTyped(true);
    }
    setText(newText);
  }, [isRecording, text]);

  // Insert text at cursor position
  const insertAtCursor = useCallback((insertText: string) => {
    const textarea = textareaRef.current;
    const currentText = text;
    
    // Add space before if needed
    const needsSpace = insertText.length > 0 && 
      currentText.length > 0 && 
      !currentText.endsWith(' ') && 
      !currentText.endsWith('\n') &&
      !insertText.startsWith(' ');
    
    const textToInsert = needsSpace ? ' ' + insertText : insertText;
    
    let newText: string;
    let newCursorPos: number;
    
    if (textarea && cursorPositionRef.current !== null) {
      // Insert at saved cursor position
      const pos = cursorPositionRef.current;
      newText = currentText.slice(0, pos) + textToInsert + currentText.slice(pos);
      newCursorPos = pos + textToInsert.length;
    } else {
      // Append to end
      newText = currentText + textToInsert;
      newCursorPos = newText.length;
    }
    
    setText(newText);
    
    // Restore cursor position after state update
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.selectionStart = newCursorPos;
        textarea.selectionEnd = newCursorPos;
        cursorPositionRef.current = newCursorPos;
      }
    });
  }, [text]);

  // Save cursor position before recording
  const saveCursorPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      cursorPositionRef.current = textarea.selectionStart;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      const msg = 'Spracheingabe nicht verfügbar. Bitte tippe.';
      setError(msg);
      onError?.(msg);
      return;
    }

    setError(null);
    setInterimText('');
    saveCursorPosition();
    
    const provider = createSttProvider({ language, continuous: true });
    providerRef.current = provider;
    
    provider.start({
      onInterim: (interim) => {
        setInterimText(interim);
      },
      onFinal: (finalText, conf) => {
        console.log('[useVoiceTextInput] Final segment:', finalText);
        insertAtCursor(finalText);
        setInterimText('');
        setUsedVoice(true);
        if (conf !== undefined) {
          setConfidence(conf);
        }
      },
      onError: (err) => {
        setError(err);
        setInterimText('');
        onError?.(err);
      },
      onStateChange: (recording) => {
        setIsRecording(recording);
        if (!recording) {
          setInterimText('');
        }
      },
    });
  }, [isSupported, language, onError, saveCursorPosition, insertAtCursor]);

  const stopRecording = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.stop();
      providerRef.current = null;
    }
    setInterimText('');
  }, []);

  const clear = useCallback(() => {
    setText('');
    setInterimText('');
    setError(null);
    setConfidence(null);
    setUsedVoice(false);
    setHasTyped(false);
    cursorPositionRef.current = null;
  }, []);

  const getSource = useCallback((): 'voice' | 'manual' | 'mixed' => {
    if (usedVoice && hasTyped) return 'mixed';
    if (usedVoice) return 'voice';
    return 'manual';
  }, [usedVoice, hasTyped]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.cancel();
      }
    };
  }, []);

  return {
    text,
    setText: handleTextChange,
    interimText,
    isRecording,
    isSupported,
    error,
    confidence,
    usedVoice,
    startRecording,
    stopRecording,
    clear,
    textareaRef,
    getSource,
  };
}
