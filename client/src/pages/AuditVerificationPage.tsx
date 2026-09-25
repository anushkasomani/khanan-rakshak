import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, Copy } from 'lucide-react';
import { api } from '../services/api';
import { AuditBlock } from '../types';
import { PageHeader, Section, Empty, titleCase, ListSkeleton } from '../components/ui';

export const AuditVerificationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [blocks, setBlocks] = useState<AuditBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState(searchParams.get('recordId') || '');
  const [result, setResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const loadBlocks = async () => {
    try {
      const data = await api.getAuditBlocks();
      setBlocks(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error fetching audit blocks:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const verify = async (id: string) => {
    if (!id.trim()) return;
    setIsVerifying(true);
    try {
      setResult(await api.verifyRecordIntegrity(id.trim()));
    } catch (e) {
      console.error('Verification error:', e);
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    loadBlocks();
    const recordId = searchParams.get('recordId');
    if (recordId) verify(recordId);
  }, []);

  const runDemo = async (action: 'tamper' | 'repair') => {
    setIsBusy(true);
    try {
      const res = action === 'tamper' ? await api.simulateTamper(2) : await api.repairAuditChain();
      setNotice(res.message);
      await loadBlocks();
      if (query) await verify(query);
    } catch (err: any) {
      setNotice(err.message || 'Something went wrong.');
    } finally {
      setIsBusy(false);
    }
  };

  const copy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(hash);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit log"
        description="Every record is sealed into a SHA-256 hash chain."
        actions={
          <>
            <button disabled={isBusy} onClick={() => runDemo('tamper')} className="btn-secondary">
              Simulate tamper
            </button>
            <button disabled={isBusy} onClick={() => runDemo('repair')} className="btn-secondary">
              Re-seal
            </button>
          </>
        }
      />

      {notice && <p className="text-sm text-zinc-400">{notice}</p>}

      <Section title="Verify a record">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify(query);
          }}
          className="flex gap-2 max-w-xl"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Record ID, e.g. SAFE-2026-00124"
            className="input font-mono uppercase placeholder:font-sans placeholder:normal-case"
          />
          <button type="submit" disabled={isVerifying} className="btn-primary shrink-0">
            {isVerifying ? 'Checking…' : 'Verify'}
          </button>
        </form>

        {result && (
          <div className={`mt-4 p-4 max-w-xl ${result.verified ? 'card' : 'card-danger'}`}>
            <div className="flex items-center gap-2">
              {result.verified ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-red-400" />}
              <p className="text-sm font-medium">{result.verified ? 'Integrity verified' : 'Integrity check failed'}</p>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              <span className="font-mono">{result.recordId}</span> · chain of {result.chainLength} blocks ·{' '}
              {result.chainIntact ? 'links intact' : 'chain broken'}
            </p>
            {result.currentHash && (
              <p className="mt-3 font-mono text-[11px] text-zinc-400 break-all">{result.currentHash}</p>
            )}
          </div>
        )}
      </Section>

      <Section title={`Ledger${blocks.length ? ` (${blocks.length} blocks)` : ''}`}>
        <div className="card divide-y divide-white/[0.05] stagger">
          {isLoading ? (
            <ListSkeleton />
          ) : blocks.length === 0 ? (
            <Empty>No blocks yet.</Empty>
          ) : (
            blocks.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                <span className="w-8 shrink-0 text-xs text-zinc-600 tabular-nums">#{b.blockIndex}</span>
                <button
                  onClick={() => {
                    setQuery(b.recordId);
                    verify(b.recordId);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm text-zinc-200 truncate">
                    {titleCase(b.recordType)} {titleCase(b.action).toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                    <span className="font-mono">{b.recordId}</span> · by {titleCase(b.performedByRole).toLowerCase()} ·{' '}
                    {new Date(b.timestamp).toLocaleString()}
                  </p>
                </button>
                <button
                  onClick={() => copy(b.currentHash)}
                  title="Copy hash"
                  className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 hover:text-zinc-200"
                >
                  {b.currentHash.substring(0, 10)}
                  {copied === b.currentHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
};
