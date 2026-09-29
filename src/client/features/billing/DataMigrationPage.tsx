import { useEffect, useRef, useState } from 'react';
import { Bot, Check, File, FileSpreadsheet, FileText, Image, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Step = 'intro' | 'upload' | 'processing' | 'review' | 'import';
type LocalFile = { id: string; name: string; size: number; type: string };

function iconFor(file: LocalFile) {
  if (file.type.startsWith('image/')) return Image;
  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) return FileSpreadsheet;
  if (file.type === 'application/pdf') return FileText;
  return File;
}

export function DataMigrationPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('intro');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [processIndex, setProcessIndex] = useState(0);
  const [prepared, setPrepared] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const processSteps = t('dataMigration.steps', { returnObjects: true }) as string[];

  useEffect(() => {
    if (step !== 'processing') return;
    setProcessIndex(0);
    const timer = window.setInterval(() => setProcessIndex((index) => {
      if (index >= processSteps.length - 1) { window.clearInterval(timer); setStep('review'); return index; }
      return index + 1;
    }), 650);
    return () => window.clearInterval(timer);
  }, [step, processSteps.length]);

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    setFiles((existing) => [...existing, ...Array.from(selected).map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, type: file.type }))]);
  };
  const formatSize = (size: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(size / 1024 / 1024) + ' MB';

  const panelStyle = { maxWidth: 920, margin: '0 auto', display: 'grid', gap: 20 } as const;
  const cardStyle = { background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 16, padding: 'clamp(20px, 4vw, 36px)' } as const;

  return <div className="page" dir="rtl" style={panelStyle}>
    {step === 'intro' && <section style={cardStyle}>
      <span className="page-kicker"><Bot className="h-4 w-4" /> AI Data Migration</span>
      <h1 className="page-title" style={{ marginTop: 12 }}>{t('dataMigration.title')}</h1>
      <p className="page-sub" style={{ maxWidth: 640, marginTop: 10 }}>{t('dataMigration.intro')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '22px 0' }}>
        {['صور الدفاتر', 'PDF', 'Excel', 'CSV', 'Documents'].map((item) => <span key={item} className="pill pill--neutral">{item}</span>)}
      </div>
      <button type="button" className="btn btn--primary" onClick={() => setStep('upload')}>{t('dataMigration.start')}</button>
    </section>}

    {step === 'upload' && <section style={cardStyle}>
      <h1 className="page-title">{t('dataMigration.title')}</h1>
      <input ref={inputRef} type="file" multiple hidden accept="image/*,.pdf,.csv,.xls,.xlsx,.doc,.docx" onChange={(event) => addFiles(event.target.files)} />
      <button type="button" onClick={() => inputRef.current?.click()} style={{ width: '100%', border: '2px dashed var(--primary, #0e7c56)', borderRadius: 14, padding: 32, background: 'var(--bg-muted, #f8fafc)', color: 'inherit', cursor: 'pointer' }}>
        <UploadCloud className="h-8 w-8" style={{ color: 'var(--primary, #0e7c56)', margin: '0 auto 10px' }} />
        <b>{t('dataMigration.dropTitle')}</b><small style={{ display: 'block', marginTop: 8, color: 'var(--text-secondary, #64748b)' }}>{t('dataMigration.dropHint')}</small>
      </button>
      <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
        {files.map((file) => { const Icon = iconFor(file); return <div key={file.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}><Icon className="h-5 w-5" /><span style={{ flex: 1 }}><b>{file.name}</b><small style={{ display: 'block' }}>{formatSize(file.size)} · {file.type || 'Document'}</small></span><span className="pill pill--success"><Check className="h-3 w-3" /> {t('dataMigration.ready')}</span><button type="button" className="icon-btn" aria-label={t('dataMigration.remove')} onClick={() => setFiles((all) => all.filter((item) => item.id !== file.id))}><Trash2 className="h-4 w-4" /></button></div>; })}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}><button type="button" className="btn btn--secondary" onClick={() => setStep('intro')}>{t('dataMigration.back')}</button><button type="button" className="btn btn--primary" disabled={!files.length} onClick={() => setStep('processing')}>{t('dataMigration.continue')}</button></div>
    </section>}

    {step === 'processing' && <section style={cardStyle}><h1 className="page-title">{t('dataMigration.processingTitle')}</h1><p className="page-sub">{t('dataMigration.processingNote')}</p><div style={{ display: 'grid', gap: 14, marginTop: 28 }}>{processSteps.map((label, index) => <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, color: index <= processIndex ? 'var(--primary, #0e7c56)' : 'var(--text-secondary, #64748b)', fontWeight: index === processIndex ? 800 : 600 }}>{index < processIndex ? <Check className="h-5 w-5" /> : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid currentColor', display: 'inline-grid', placeItems: 'center' }}>{index === processIndex && '•'}</span>}{label}</div>)}</div></section>}

    {step === 'review' && <section style={cardStyle}><h1 className="page-title">{t('dataMigration.reviewTitle')}</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '20px 0' }}>{[['١٬٨٤٧', t('dataMigration.students')], ['١٬٧٩٢', t('dataMigration.recognized')], ['٤٣', t('dataMigration.needsReview')], ['١٢', t('dataMigration.duplicates')]].map(([value, label]) => <div key={label} className="card" style={{ padding: 14 }}><b style={{ fontSize: 22 }}>{value}</b><small style={{ display: 'block' }}>{label}</small></div>)}</div><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr>{['student', 'phone', 'grade', 'status'].map((key) => <th key={key}>{t(`dataMigration.${key}`)}</th>)}</tr></thead><tbody><tr><td>أحمد محمد</td><td dir="ltr">010••••••••</td><td>3 ثانوي</td><td><span className="pill pill--success">{t('dataMigration.readyStatus')}</span></td></tr><tr><td>محمد علي</td><td dir="ltr">011••••••••</td><td>2 ثانوي</td><td><span className="pill pill--warning">{t('dataMigration.reviewStatus')}</span></td></tr></tbody></table></div><button type="button" className="btn btn--primary" style={{ marginTop: 20 }} onClick={() => setStep('import')}>{t('dataMigration.continue')}</button></section>}

    {step === 'import' && <section style={cardStyle}><h1 className="page-title">{t('dataMigration.importTitle')}</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '20px 0' }}>{[['١٬٨٤٧', 'students'], ['٣٢', 'teachers'], ['٨٬٤٢١', 'payments'], ['١٢', 'duplicates'], ['٠', 'reviewCount']].map(([value, key]) => <div key={key} className="card" style={{ padding: 14 }}><b style={{ fontSize: 22 }}>{value}</b><small style={{ display: 'block' }}>{t(`dataMigration.${key}`)}</small></div>)}</div><button type="button" className="btn btn--primary" onClick={() => setPrepared(true)}>{t('dataMigration.import')}</button>{prepared && <p className="notice notice--info" style={{ marginTop: 16 }}>{t('dataMigration.prepared')}</p>}</section>}
  </div>;
}
