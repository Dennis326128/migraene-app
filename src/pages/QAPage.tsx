/**
 * Tech QA Runner - Read-only stability checks for DEV/QA environments
 * Gate: Only accessible in DEV mode or when VITE_ENABLE_QA=true
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCapturedErrors, clearCapturedErrors } from '@/lib/qa/errorCapture';
import { getRenderStats, clearRenderStats } from '@/lib/qa/renderGuard';
import { 
  CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, Trash2, 
  Copy, Play, Database, Monitor, FileText, ChevronDown, ChevronUp 
} from 'lucide-react';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type TestStatus = 'pending' | 'pass' | 'fail' | 'warn';

interface TestResult {
  name: string;
  category: 'connectivity' | 'ui' | 'pdf';
  status: TestStatus;
  message?: string;
  duration?: number;
  details?: string;
}

interface SystemInfo {
  buildId: string;
  timestamp: string;
  userId: string;
  browser: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const TABLES_TO_CHECK = [
  'pain_entries',
  'reminders', 
  'user_medications',
  'medication_courses',
  'doctors',
  'user_profiles'
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function QAPage() {
  // Gate: only accessible in DEV mode or when VITE_ENABLE_QA is set
  const enabled = import.meta.env.DEV === true || import.meta.env.VITE_ENABLE_QA === 'true';
  
  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningCategory, setRunningCategory] = useState<string | null>(null);
  const [capturedErrors, setCapturedErrors] = useState(getCapturedErrors());
  const [renderStats, setRenderStats] = useState(getRenderStats());
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  // ─────────────────────────────────────────────────────────────────────────
  // System Info
  // ─────────────────────────────────────────────────────────────────────────
  
  const systemInfo = useMemo<SystemInfo>(() => {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    
    return {
      buildId: import.meta.env.VITE_BUILD_ID || 'dev-local',
      timestamp: new Date().toLocaleString('de-DE'),
      userId: '(wird geladen...)',
      browser: `${browser} / ${navigator.platform}`,
    };
  }, []);

  const [userId, setUserId] = useState<string>(systemInfo.userId);

  // Load user ID on mount
  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) {
        setUserId(data.session.user.id.substring(0, 8) + '...');
      } else {
        setUserId('(nicht eingeloggt)');
      }
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Test Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const updateResult = useCallback((name: string, update: Partial<TestResult>) => {
    setResults(prev => prev.map(r => r.name === name ? { ...r, ...update } : r));
  }, []);

  const runTest = useCallback(async (
    name: string, 
    testFn: () => Promise<{ status: TestStatus; message?: string; details?: string }>
  ): Promise<void> => {
    const start = performance.now();
    try {
      const result = await testFn();
      updateResult(name, { 
        ...result, 
        duration: Math.round(performance.now() - start) 
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = error instanceof Error ? error.stack : undefined;
      updateResult(name, { 
        status: 'fail', 
        message, 
        details,
        duration: Math.round(performance.now() - start) 
      });
    }
  }, [updateResult]);

  // ─────────────────────────────────────────────────────────────────────────
  // Connectivity Checks (READ-ONLY)
  // ─────────────────────────────────────────────────────────────────────────

  const runConnectivityChecks = useCallback(async (): Promise<TestResult[]> => {
    const tests: TestResult[] = [
      { name: 'Auth Session', category: 'connectivity', status: 'pending' },
      ...TABLES_TO_CHECK.map(t => ({ 
        name: `Table: ${t}`, 
        category: 'connectivity' as const, 
        status: 'pending' as TestStatus 
      })),
    ];
    
    setResults(prev => [...prev.filter(r => r.category !== 'connectivity'), ...tests]);

    // Auth Session
    await runTest('Auth Session', async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) return { status: 'fail', message: error.message };
      if (!session) return { status: 'warn', message: 'Keine aktive Session' };
      return { status: 'pass', message: `User: ${session.user.id.substring(0, 8)}...` };
    });

    // Table checks (head: true = no data transferred, just count)
    for (const table of TABLES_TO_CHECK) {
      await runTest(`Table: ${table}`, async () => {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          // Check for RLS/permission issues
          if (error.code === '42501' || error.message.includes('permission')) {
            return { 
              status: 'warn', 
              message: 'RLS/Auth Issue',
              details: error.message 
            };
          }
          return { status: 'fail', message: error.message };
        }
        return { status: 'pass', message: `${count ?? 0} rows` };
      });
    }

    return tests;
  }, [runTest]);

  // ─────────────────────────────────────────────────────────────────────────
  // UI Render Checks (READ-ONLY, no navigation)
  // ─────────────────────────────────────────────────────────────────────────

  const runUIChecks = useCallback(async (): Promise<TestResult[]> => {
    const tests: TestResult[] = [
      { name: 'React Render Context', category: 'ui', status: 'pending' },
      { name: 'Component Imports', category: 'ui', status: 'pending' },
      { name: 'Router State', category: 'ui', status: 'pending' },
      { name: 'Render Loop Check', category: 'ui', status: 'pending' },
    ];
    
    setResults(prev => [...prev.filter(r => r.category !== 'ui'), ...tests]);

    // React Render Context
    await runTest('React Render Context', async () => {
      try {
        // Check if React is properly mounted
        const root = document.getElementById('root');
        if (!root) return { status: 'fail', message: 'Root element not found' };
        if (root.childElementCount === 0) return { status: 'fail', message: 'Root has no children' };
        return { status: 'pass', message: 'React mounted correctly' };
      } catch (e) {
        return { status: 'fail', message: String(e) };
      }
    });

    // Component Imports Check
    await runTest('Component Imports', async () => {
      try {
        // Dynamic import test for critical components
        const [Button, Card, Badge] = await Promise.all([
          import('@/components/ui/button'),
          import('@/components/ui/card'),
          import('@/components/ui/badge'),
        ]);
        if (!Button.Button || !Card.Card || !Badge.Badge) {
          return { status: 'fail', message: 'UI components not exported correctly' };
        }
        return { status: 'pass', message: 'Core UI components OK' };
      } catch (e) {
        return { status: 'fail', message: String(e) };
      }
    });

    // Router State
    await runTest('Router State', async () => {
      try {
        const currentPath = window.location.pathname;
        if (currentPath !== '/qa') {
          return { status: 'warn', message: `Expected /qa, got ${currentPath}` };
        }
        return { status: 'pass', message: 'Route: /qa' };
      } catch (e) {
        return { status: 'fail', message: String(e) };
      }
    });

    // Render Loop Check
    await runTest('Render Loop Check', async () => {
      const stats = getRenderStats();
      const highRenderComponents = Object.entries(stats)
        .filter(([, s]) => s.count > 30)
        .map(([name]) => name);
      
      if (highRenderComponents.length > 0) {
        return { 
          status: 'warn', 
          message: `${highRenderComponents.length} component(s) with high renders`,
          details: highRenderComponents.join(', ')
        };
      }
      return { status: 'pass', message: 'No render loops detected' };
    });

    return tests;
  }, [runTest]);

  // ─────────────────────────────────────────────────────────────────────────
  // PDF Dry Run (READ-ONLY, no download/save)
  // ─────────────────────────────────────────────────────────────────────────

  const runPDFChecks = useCallback(async (): Promise<TestResult[]> => {
    const tests: TestResult[] = [
      { name: 'PDF Library Import', category: 'pdf', status: 'pending' },
      { name: 'PDF Document Creation', category: 'pdf', status: 'pending' },
    ];
    
    setResults(prev => [...prev.filter(r => r.category !== 'pdf'), ...tests]);

    // PDF Library Import
    await runTest('PDF Library Import', async () => {
      try {
        const pdfLib = await import('pdf-lib');
        if (!pdfLib.PDFDocument) {
          return { status: 'fail', message: 'PDFDocument not available' };
        }
        return { status: 'pass', message: 'pdf-lib loaded' };
      } catch (e) {
        return { status: 'fail', message: String(e) };
      }
    });

    // PDF Document Creation (dry run - no save)
    await runTest('PDF Document Creation', async () => {
      try {
        const { PDFDocument, StandardFonts } = await import('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const page = pdfDoc.addPage();
        page.drawText('QA Test', { x: 50, y: 700, size: 12, font });
        
        // Generate bytes but don't save/download
        const bytes = await pdfDoc.save();
        if (bytes.length < 100) {
          return { status: 'fail', message: 'PDF too small' };
        }
        return { status: 'pass', message: `Dry run OK (${Math.round(bytes.length / 1024)}KB)` };
      } catch (e) {
        return { status: 'fail', message: String(e) };
      }
    });

    return tests;
  }, [runTest]);

  // ─────────────────────────────────────────────────────────────────────────
  // Run All Checks
  // ─────────────────────────────────────────────────────────────────────────

  const runAllChecks = useCallback(async () => {
    setIsRunning(true);
    setResults([]);
    setRunningCategory('all');
    
    await runConnectivityChecks();
    await runUIChecks();
    await runPDFChecks();
    
    setIsRunning(false);
    setRunningCategory(null);
  }, [runConnectivityChecks, runUIChecks, runPDFChecks]);

  const runCategoryChecks = useCallback(async (category: 'connectivity' | 'ui' | 'pdf') => {
    setIsRunning(true);
    setRunningCategory(category);
    
    if (category === 'connectivity') await runConnectivityChecks();
    else if (category === 'ui') await runUIChecks();
    else if (category === 'pdf') await runPDFChecks();
    
    setIsRunning(false);
    setRunningCategory(null);
  }, [runConnectivityChecks, runUIChecks, runPDFChecks]);

  // ─────────────────────────────────────────────────────────────────────────
  // Report Generation
  // ─────────────────────────────────────────────────────────────────────────

  const generateReport = useCallback(() => {
    const passCount = results.filter(r => r.status === 'pass').length;
    const failCount = results.filter(r => r.status === 'fail').length;
    const warnCount = results.filter(r => r.status === 'warn').length;

    const lines = [
      '# Tech QA Report',
      '',
      `**Build:** ${systemInfo.buildId}`,
      `**Time:** ${systemInfo.timestamp}`,
      `**User:** ${userId}`,
      `**Browser:** ${systemInfo.browser}`,
      '',
      `## Summary: ${passCount} PASS / ${warnCount} WARN / ${failCount} FAIL`,
      '',
      '## Checks',
      ...results.map(r => {
        const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
        const duration = r.duration ? ` (${r.duration}ms)` : '';
        const msg = r.message ? ` - ${r.message}` : '';
        return `- ${icon} **${r.name}**${duration}${msg}`;
      }),
    ];

    if (capturedErrors.length > 0) {
      lines.push('', '## Captured Errors');
      capturedErrors.slice(-10).forEach((err, i) => {
        lines.push(`${i + 1}. [${err.type}] ${err.route}: ${err.message}`);
      });
    }

    return lines.join('\n');
  }, [results, systemInfo, userId, capturedErrors]);

  const copyReport = useCallback(() => {
    const report = generateReport();
    navigator.clipboard.writeText(report).then(() => {
      toast.success('Report kopiert');
    }).catch(() => {
      toast.error('Kopieren fehlgeschlagen');
    });
  }, [generateReport]);

  const copyErrors = useCallback(() => {
    const errorText = capturedErrors.map(e => 
      `[${e.timestamp}] ${e.type} @ ${e.route}: ${e.message}`
    ).join('\n');
    navigator.clipboard.writeText(errorText).then(() => {
      toast.success('Errors kopiert');
    }).catch(() => {
      toast.error('Kopieren fehlgeschlagen');
    });
  }, [capturedErrors]);

  // ─────────────────────────────────────────────────────────────────────────
  // UI Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const toggleExpand = useCallback((name: string) => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setResults([]);
    clearCapturedErrors();
    clearRenderStats();
    setCapturedErrors([]);
    setRenderStats({});
  }, []);

  const refreshData = useCallback(() => {
    setCapturedErrors(getCapturedErrors());
    setRenderStats(getRenderStats());
  }, []);

  // Stats
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warn').length;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background p-4 pb-safe">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tech QA Runner</h1>
            <p className="text-sm text-muted-foreground">Read-only stability checks</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            ← Zurück
          </Button>
        </div>

        {/* System Info Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Build:</span>
                <p className="font-mono text-xs">{systemInfo.buildId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Zeit:</span>
                <p className="font-mono text-xs">{systemInfo.timestamp}</p>
              </div>
              <div>
                <span className="text-muted-foreground">User:</span>
                <p className="font-mono text-xs">{userId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Browser:</span>
                <p className="font-mono text-xs truncate">{systemInfo.browser}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={runAllChecks} disabled={isRunning} className="flex-1 min-w-[140px]">
                {isRunning && runningCategory === 'all' ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" />Run All Checks</>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => runCategoryChecks('connectivity')} 
                disabled={isRunning}
                size="sm"
              >
                <Database className="mr-1 h-3 w-3" />Connectivity
              </Button>
              <Button 
                variant="outline" 
                onClick={() => runCategoryChecks('ui')} 
                disabled={isRunning}
                size="sm"
              >
                <Monitor className="mr-1 h-3 w-3" />UI Render
              </Button>
              <Button 
                variant="outline" 
                onClick={() => runCategoryChecks('pdf')} 
                disabled={isRunning}
                size="sm"
              >
                <FileText className="mr-1 h-3 w-3" />PDF Dry Run
              </Button>
              <Button 
                variant="outline" 
                onClick={copyReport} 
                disabled={results.length === 0}
                size="sm"
              >
                <Copy className="mr-1 h-3 w-3" />Copy Report
              </Button>
              <Button variant="ghost" onClick={clearAll} size="sm">
                <Trash2 className="mr-1 h-3 w-3" />Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        {results.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span>Check Results</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600">
                    {passCount} PASS
                  </Badge>
                  {warnCount > 0 && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                      {warnCount} WARN
                    </Badge>
                  )}
                  {failCount > 0 && (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600">
                      {failCount} FAIL
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {results.map(result => (
                  <div key={result.name}>
                    <div 
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50 cursor-pointer hover:bg-muted/70"
                      onClick={() => result.details && toggleExpand(result.name)}
                    >
                      <div className="flex items-center gap-2">
                        {result.status === 'pending' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {result.status === 'pass' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {result.status === 'warn' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        {result.status === 'fail' && <XCircle className="h-4 w-4 text-red-500" />}
                        <span className="text-sm font-medium">{result.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {result.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.duration !== undefined && (
                          <span className="text-xs text-muted-foreground">{result.duration}ms</span>
                        )}
                        {result.message && (
                          <span className={`text-xs max-w-[200px] truncate ${
                            result.status === 'fail' ? 'text-red-500' : 
                            result.status === 'warn' ? 'text-amber-500' : 'text-muted-foreground'
                          }`}>
                            {result.message}
                          </span>
                        )}
                        {result.details && (
                          expandedResults.has(result.name) 
                            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    {result.details && expandedResults.has(result.name) && (
                      <div className="ml-6 p-2 mt-1 rounded bg-muted/30 text-xs font-mono break-all">
                        {result.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Captured Errors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Captured Errors ({capturedErrors.length})</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={refreshData}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={copyErrors} disabled={capturedErrors.length === 0}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { clearCapturedErrors(); setCapturedErrors([]); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
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
                      <span>{error.type}</span>
                      <span>{error.route}</span>
                      <span>{error.timestamp}</span>
                    </div>
                    <p className="font-mono text-xs break-all">{error.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Render Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>Render Stats</span>
              <Button size="sm" variant="ghost" onClick={() => { clearRenderStats(); setRenderStats({}); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(renderStats).length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Komponenten getrackt</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(renderStats)
                  .sort(([,a], [,b]) => b.count - a.count)
                  .map(([name, stats]) => (
                    <div key={name} className="flex justify-between text-sm p-1 rounded hover:bg-muted/50">
                      <span className="font-mono text-xs">{name}</span>
                      <span className={stats.count > 30 ? 'text-red-500 font-bold' : stats.count > 20 ? 'text-amber-500' : 'text-muted-foreground'}>
                        {stats.count} renders
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
