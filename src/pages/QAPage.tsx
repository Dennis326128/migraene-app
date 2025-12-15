/**
 * QA Smoke Test Page (DEV only)
 */

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCapturedErrors, clearCapturedErrors } from '@/lib/qa/errorCapture';
import { getRenderStats, clearRenderStats } from '@/lib/qa/renderGuard';
import { CheckCircle, XCircle, Loader2, RefreshCw, Trash2 } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'pending' | 'pass' | 'fail';
  message?: string;
  duration?: number;
}

export default function QAPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [capturedErrors, setCapturedErrors] = useState(getCapturedErrors());
  const [renderStats, setRenderStats] = useState(getRenderStats());

  const updateResult = (name: string, update: Partial<TestResult>) => {
    setResults(prev => prev.map(r => r.name === name ? { ...r, ...update } : r));
  };

  const runTest = async (name: string, testFn: () => Promise<void>): Promise<void> => {
    const start = performance.now();
    try {
      await testFn();
      updateResult(name, { status: 'pass', duration: Math.round(performance.now() - start) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateResult(name, { status: 'fail', message, duration: Math.round(performance.now() - start) });
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    const tests: TestResult[] = [
      { name: 'Auth Session', status: 'pending' },
      { name: 'Select pain_entries', status: 'pending' },
      { name: 'Select reminders', status: 'pending' },
      { name: 'Select user_medications', status: 'pending' },
      { name: 'Select user_profiles', status: 'pending' },
    ];
    setResults(tests);

    await runTest('Auth Session', async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!session) throw new Error('No active session');
    });

    for (const table of ['pain_entries', 'reminders', 'user_medications', 'user_profiles']) {
      await runTest(`Select ${table}`, async () => {
        const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) throw error;
      });
    }
    setIsRunning(false);
  };

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;

  return (
    <div className="min-h-screen bg-background p-4 pb-safe">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>← Zurück</Button>
          <h1 className="text-xl font-bold">QA Smoke Tests</h1>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>API Connectivity Tests</span>
                {results.length > 0 && (
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-green-500/10 text-green-600">{passCount} PASS</Badge>
                    <Badge variant="outline" className="bg-red-500/10 text-red-600">{failCount} FAIL</Badge>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={runAllTests} disabled={isRunning} className="w-full">
                {isRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Tests laufen...</> : 'Alle Tests ausführen'}
              </Button>
              {results.length > 0 && (
                <div className="space-y-2">
                  {results.map(result => (
                    <div key={result.name} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2">
                        {result.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {result.status === 'pass' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {result.status === 'fail' && <XCircle className="h-4 w-4 text-red-500" />}
                        <span className="text-sm">{result.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.duration !== undefined && <span className="text-xs text-muted-foreground">{result.duration}ms</span>}
                        {result.message && <span className="text-xs text-red-500 max-w-[200px] truncate">{result.message}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Erfasste Fehler ({capturedErrors.length})</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setCapturedErrors(getCapturedErrors()); setRenderStats(getRenderStats()); }}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { clearCapturedErrors(); setCapturedErrors([]); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {capturedErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Fehler erfasst</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {capturedErrors.slice(-10).reverse().map((error, i) => (
                    <div key={i} className="p-2 rounded bg-red-500/10 text-sm">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{error.type}</span><span>{error.route}</span>
                      </div>
                      <p className="font-mono text-xs break-all">{error.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Render Stats</span>
                <Button size="sm" variant="ghost" onClick={() => { clearRenderStats(); setRenderStats({}); }}><Trash2 className="h-4 w-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(renderStats).length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Komponenten getrackt</p>
              ) : (
                <div className="space-y-1">
                  {Object.entries(renderStats).map(([name, stats]) => (
                    <div key={name} className="flex justify-between text-sm p-1 rounded hover:bg-muted/50">
                      <span className="font-mono">{name}</span>
                      <span className={stats.count > 20 ? 'text-amber-500' : 'text-muted-foreground'}>{stats.count} renders</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
