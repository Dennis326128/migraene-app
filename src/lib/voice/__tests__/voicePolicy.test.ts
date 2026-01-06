/**
 * Test: Voice Policy decisions
 */

import { describe, it, expect } from 'vitest';
import { evaluatePolicy, getActionCategory, POLICY_THRESHOLDS } from '../voicePolicy';

describe('voicePolicy', () => {
  describe('getActionCategory', () => {
    it('categorizes navigation intents', () => {
      expect(getActionCategory('navigate_diary')).toBe('navigation');
      expect(getActionCategory('navigate_medications')).toBe('navigation');
    });
    
    it('categorizes analytics intents', () => {
      expect(getActionCategory('analytics_query')).toBe('analytics');
    });
    
    it('categorizes mutation intents', () => {
      expect(getActionCategory('create_pain_entry')).toBe('mutation');
      expect(getActionCategory('add_medication')).toBe('mutation');
      expect(getActionCategory('create_note')).toBe('mutation');
    });
  });
  
  describe('evaluatePolicy', () => {
    it('auto-executes navigation at >= 0.75', () => {
      const result = evaluatePolicy({
        source: 'stt',
        confidence: 0.80,
        intentType: 'navigate_diary',
      });
      expect(result.action).toBe('auto_execute');
    });
    
    it('confirms navigation at < 0.75', () => {
      const result = evaluatePolicy({
        source: 'stt',
        confidence: 0.65,
        intentType: 'navigate_diary',
      });
      expect(result.action).toBe('confirm');
    });
    
    it('auto-executes analytics at >= 0.75', () => {
      const result = evaluatePolicy({
        source: 'stt',
        confidence: 0.80,
        intentType: 'analytics_query',
      });
      expect(result.action).toBe('auto_execute');
    });
    
    it('requires higher confidence (0.90) for mutation auto-execute', () => {
      const result85 = evaluatePolicy({
        source: 'stt',
        confidence: 0.85,
        intentType: 'create_pain_entry',
      });
      expect(result85.action).toBe('confirm'); // Not auto
      
      const result92 = evaluatePolicy({
        source: 'stt',
        confidence: 0.92,
        intentType: 'create_pain_entry',
      });
      expect(result92.action).toBe('auto_execute');
    });
    
    it('NEVER auto-mutates from dictation_fallback', () => {
      const result = evaluatePolicy({
        source: 'dictation_fallback',
        confidence: 0.95,
        intentType: 'add_medication',
      });
      expect(result.action).toBe('confirm');
    });
    
    it('triggers disambiguation when scores are close', () => {
      const result = evaluatePolicy({
        source: 'stt',
        confidence: 0.70,
        intentType: 'pain_entry',
        top2ScoreDiff: 0.08, // Less than threshold 0.12
      });
      expect(result.action).toBe('disambiguation');
    });
    
    it('shows action picker for unknown intent', () => {
      const result = evaluatePolicy({
        source: 'stt',
        confidence: 0.30,
        intentType: 'unknown',
      });
      expect(result.action).toBe('action_picker');
    });
    
    it('triggers slot_filling when slots are missing', () => {
      const result = evaluatePolicy({
        source: 'stt',
        confidence: 0.85,
        intentType: 'add_medication',
        hasMissingSlots: true,
      });
      expect(result.action).toBe('slot_filling');
    });
    
    it('triggers disambiguation for ambiguous input', () => {
      const result = evaluatePolicy({
        source: 'stt',
        confidence: 0.60,
        intentType: 'pain_entry',
        isAmbiguous: true,
      });
      expect(result.action).toBe('disambiguation');
    });
  });
});
