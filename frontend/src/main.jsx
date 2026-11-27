import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Upload, WandSparkles, PanelsTopLeft,
  Eye, Youtube, Settings, Search, Plus, Check, Clock3,
  AlertTriangle, Play, MoreHorizontal, ChevronRight, MessageCircle, Trash2, Download, Pencil
} from 'lucide-react';
import './styles.css';

const API = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000' : '')).replace(/\/+$/, '');

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Video server returned an invalid response (${response.status}). Check VITE_API_URL.`);
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function IconButton({ icon: Icon, label, active, onClick }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} title={label}>
    <Icon size={19} /><span>{label}</span>
  </button>;
}

function App() {
  const [page, setPage] = useState(new URLSearchParams(location.search).get('page') === 'youtube' ? 'YouTube' : 'Dashboard');
  const [stats, setStats] = useState({ imported: 0, clips: 0, approved: 0, uploaded: 0, failed: 0 });
  const [clips, setClips] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [youtubeStatus, setYoutubeStatus] = useState(null);
  const [uploadPrivacy, setUploadPrivacy] = useState('private');
  const [defaultTemplateId, setDefaultTemplateId] = useState('default');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [apiError, setApiError] = useState('');

  async function refresh() {
    try {
      if (!API) throw new Error('VITE_API_URL is not set for this deployed website.');
      const [s, c, j, t, settings, youtube] = await Promise.all([
        fetchJson(`${API}/api/dashboard`),
        fetchJson(`${API}/api/clips`),
        fetchJson(`${API}/api/jobs`),
        fetchJson(`${API}/api/templates`),
        fetchJson(`${API}/api/settings`),
        fetchJson(`${API}/api/youtube/status`)
      ]);
      setStats(s); setClips(c); setJobs(j); setTemplates(t);
      setDefaultTemplateId(settings.defaultTemplateId);
      setYoutubeStatus(youtube);
      setApiError('');
    } catch (error) {
      setApiError(`Cannot connect to the video server. ${error.message}`);
    }
  }
  useEffect(() => { refresh(); const id = setInterval(refresh, 4000); return () => clearInterval(id); }, []);

  async function importUrl(e) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const data = await fetchJson(`${API}/api/import/url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl, ownershipConfirmed, templateId: selectedTemplateId || defaultTemplateId })
      });
      setMessage('Import started. Processing in the background.');
      setActiveJobId(data.jobId);
    } catch (error) {
      setMessage(error.message || 'Import failed. Check the video server and try again.');
    } finally {
      setBusy(false); refresh();
    }
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    const form = new FormData(); form.append('video', file);
    form.append('templateId', selectedTemplateId || defaultTemplateId);
    try {
      const data = await fetchJson(`${API}/api/import/upload`, { method: 'POST', body: form });
      setMessage('Upload started. Processing in the background.');
      setActiveJobId(data.jobId);
    } catch (error) {
      setMessage(error.message || 'Upload failed. Check the video server and try again.');
    } finally {
      setBusy(false); refresh();
    }
  }

  async function approveClip(id) {
    await fetchJson(`${API}/api/clips/${id}/approve`, { method: 'POST' }); refresh();
  }

  const nav = [
    ['Dashboard', LayoutDashboard], ['Import', Upload], ['Clips', WandSparkles],
    ['Templates', PanelsTopLeft], ['Preview', Eye], ['YouTube', Youtube], ['Settings', Settings],
    ['AI Assistant', MessageCircle]
  ];

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><WandSparkles size={18}/></div><div><b>ChronicAI</b><small>SHORTS STUDIO</small></div></div>
      <nav className="sidebar-nav">
        <span className="nav-label">WORKSPACE</span>
        {nav.map(([label, Icon], index) => <React.Fragment key={label}>
          {index === 5 && <span className="nav-label nav-label-secondary">PUBLISH & SUPPORT</span>}
          <IconButton icon={Icon} label={label} active={page === label} onClick={() => setPage(label)} />
        </React.Fragment>)}
      </nav>
      <QuotaRenewal />
      <div className="profile"><div className="avatar">AK</div><div><b>Studio Account</b><small>Creator workspace</small></div><MoreHorizontal size={18} /></div>
    </aside>
    <main>
      <header><div className="page-heading"><p>YOUR CREATOR WORKSPACE</p><h1>{page}</h1><span>{page === 'Dashboard' ? 'Your video workflow, all in one place.' : page === 'Import' ? 'Bring in a video and turn it into standout shorts.' : page === 'Clips' || page === 'Preview' ? 'Review, refine, and publish your latest clips.' : page === 'Templates' ? 'Make every short feel like your brand.' : page === 'YouTube' ? 'Manage your channel connection and publishing.' : page === 'Settings' ? 'Fine-tune your content workflow.' : 'Get help with your video workflow.'}</span></div><div className="header-actions"><QuotaRenewal compact/><button className="icon" aria-label="Search"><Search size={18}/></button><button className="primary" onClick={() => setPage('Import')}><Plus size={17}/> New Project</button></div></header>
      {apiError && <div className="api-connection-error" role="alert"><AlertTriangle size={17}/><span>{apiError}</span><button className="secondary" onClick={refresh}>Retry connection</button></div>}
      {page === 'Dashboard' && <Dashboard stats={stats} jobs={jobs} clips={clips} setPage={setPage}/>}
      {page === 'Import' && <Import sourceUrl={sourceUrl} setSourceUrl={value=>{setSourceUrl(value);setOwnershipConfirmed(false);}} ownershipConfirmed={ownershipConfirmed} setOwnershipConfirmed={setOwnershipConfirmed} importUrl={importUrl} uploadFile={uploadFile} busy={busy} message={message} templates={templates} defaultTemplateId={defaultTemplateId} selectedTemplateId={selectedTemplateId || defaultTemplateId} setSelectedTemplateId={setSelectedTemplateId} activeJobId={activeJobId || jobs.find(job => job.file_path)?.id || jobs.find(job => ['importing','downloading','processing'].includes(job.status))?.id}/>}
      {page === 'Clips' && <Clips clips={clips} templates={templates} approveClip={approveClip} onDeleted={refresh} youtubeConnected={youtubeStatus?.connected} uploadPrivacy={uploadPrivacy} setPage={setPage}/>}
      {page === 'Templates' && <Templates templates={templates} defaultTemplateId={defaultTemplateId} onDefaultChange={id=>{setDefaultTemplateId(id);setSelectedTemplateId('');}} refresh={refresh}/>}
      {page === 'YouTube' && <YouTubeSetup status={youtubeStatus} privacy={uploadPrivacy} setPrivacy={setUploadPrivacy}/>}
      {page === 'Settings' && <Automation />}
      {page === 'Preview' && <Clips clips={clips} templates={templates} approveClip={approveClip} onDeleted={refresh} youtubeConnected={youtubeStatus?.connected} uploadPrivacy={uploadPrivacy} setPage={setPage}/>}
      {page === 'AI Assistant' && <Assistant />}
    </main>
  </div>;
}

function QuotaRenewal({ compact = false }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  function pacificTimeParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  }

  const pacific = pacificTimeParts(now);
  const todayKey = `${pacific.year}-${pacific.month}-${pacific.day}`;
  let reset = new Date(now);
  const halfHour = 30 * 60 * 1000;
  reset = new Date(Math.floor(now.getTime() / halfHour) * halfHour);
  for (let i = 0; i < 96; i++) {
    const candidate = new Date(reset.getTime() + i * halfHour);
    const candidatePacific = pacificTimeParts(candidate);
    const candidateKey = `${candidatePacific.year}-${candidatePacific.month}-${candidatePacific.day}`;
    if (candidateKey !== todayKey && candidatePacific.hour === 0 && candidatePacific.minute === 0) {
      reset = candidate;
      break;
    }
  }

  const remaining = Math.max(0, reset.getTime() - now.getTime());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const countdown = [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');

  const elapsed = Math.max(0, Math.min((24 * 60 * 60 * 1000) - remaining, 24 * 60 * 60 * 1000));
  const elapsedPercent = elapsed / (24 * 60 * 60 * 1000) * 100;

  return <div className={`quota quota-renewal${compact ? ' quota-renewal-compact' : ''}`}>
    {!compact && <div className="quota-top"><span>YouTube quota</span></div>}
    <div className="quota-renewal-row">
      <div className="quota-ring" style={{ '--renewal-progress': `${elapsedPercent * 3.6}deg` }}>
        <div><Clock3 size={11}/></div>
      </div>
      <div>
        <small>Daily quota renews in</small>
        <strong aria-live="off">{countdown}</strong>
      </div>
    </div>
  </div>;
}

function Assistant() {
  const [messages, setMessages] = useState([{
    role: 'model',
    text: 'হ্যালো! ভিডিও processing, Gemini setup, বা YouTube OAuth-এ কী সমস্যা হচ্ছে বলুন। App-এর বর্তমান job status দেখে ধাপে ধাপে সাহায্য করব।'
  }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(text = input) {
    const question = text.trim();
    if (!question || busy) return;
    const previous = messages.slice(-8).map(({role, text: content}) => ({role, text:content}));
    setMessages(current => [...current, {role:'user', text:question}]);
    setInput(''); setError(''); setBusy(true);
    try {
      const response = await fetch(`${API}/api/assistant/chat`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:question, history:previous})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Assistant request failed.');
      setMessages(current => [...current, {role:'model', text:data.answer}]);
    } catch (err) {
      setError(err.message || 'Could not reach the assistant.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="assistant panel">
    <div className="assistant-heading"><div className="assistant-avatar"><MessageCircle size={20}/></div><div><h2>AI Help Assistant</h2><p>App status-aware help, powered by Gemini</p></div><span className="assistant-online"><i/> Ready</span></div>
    <div className="assistant-messages" aria-live="polite">
      {messages.map((item,index)=><div className={`chat-message ${item.role === 'user' ? 'from-user' : 'from-assistant'}`} key={`${index}-${item.role}`}><div>{item.text}</div></div>)}
      {busy && <div className="chat-message from-assistant"><div className="typing">Gemini is thinking<span>.</span><span>.</span><span>.</span></div></div>}
    </div>
    {error && <div className="assistant-error"><AlertTriangle size={15}/>{error}</div>}
    <div className="assistant-prompts">
      {['YouTube redirect_uri_mismatch ta solve korbo kivabe?', 'Amar latest video job-er status ki?', 'Gemini API key setup check korte help koro'].map(prompt=><button key={prompt} onClick={()=>send(prompt)} disabled={busy}>{prompt}</button>)}
    </div>
    <form className="assistant-input" onSubmit={event=>{event.preventDefault();send();}}>
      <textarea value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}}} placeholder="আপনার সমস্যা লিখুন..." rows={2} maxLength={2000}/>
      <button className="primary" type="submit" disabled={busy||!input.trim()}>{busy?'Working…':'Ask assistant'}</button>
    </form>
    <small className="assistant-privacy">API keys and OAuth secrets are never included in assistant context.</small>
  </section>;
}

function Dashboard({stats, jobs, clips, setPage}) {
  const cards = [
    ['Imported Videos', stats.imported, Upload, 'violet'],
    ['Generated Clips', stats.clips, WandSparkles, 'blue'],
    ['Approved', stats.approved, Check, 'green'],
    ['Uploaded', stats.uploaded, Youtube, 'red']
  ];
  return <>
    <section className="dashboard-hero">
      <div className="dashboard-hero-copy"><span className="hero-kicker"><WandSparkles size={14}/> YOUR SHORTS WORKFLOW</span><h2>Make something<br/><em>worth watching.</em></h2><p>Import a video, shape it into vertical clips, and get it ready to publish.</p><button className="primary" onClick={() => setPage('Import')}><Plus size={16}/> Start a new project</button></div>
      <div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-phone"><div className="hero-phone-screen"><WandSparkles size={26}/><span>YOUR NEXT<br/>SHORT STARTS HERE</span><i/></div></div><div className="hero-sparkle sparkle-one">✦</div><div className="hero-sparkle sparkle-two">✧</div></div>
    </section>
    <div className="stats">{cards.map(([label, value, Icon, tone]) => <div className="stat" key={label}><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div><small>{label}</small><strong>{value}</strong></div><ChevronRight size={16}/></div>)}</div>
    <div className="grid">
      <section className="panel queue"><div className="panel-head"><div><p>LIVE ACTIVITY</p><h2>Processing Queue</h2></div><button className="text-button" onClick={() => setPage('Clips')}>View all</button></div>
        {jobs.length ? jobs.map(j => <div className="job" key={j.id}><div className="job-thumb"><Play size={16}/></div><div className="job-info"><b>{j.title || 'Imported video'}</b><small>{j.status === 'completed' ? 'Ready for review' : j.status}</small></div><div className={`status ${j.status}`}><i/> {j.status}</div></div>) : <Empty icon={Clock3} text="No active jobs" />}
      </section>
      <section className="panel chart"><div className="panel-head"><div><p>PERFORMANCE</p><h2>Upload activity</h2></div><b>7 days</b></div><div className="bars">{[35,58,42,70,48,82,64].map((h,i)=><div key={i}><i style={{height:h+'%'}}/><small>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</small></div>)}</div></section>
    </div>
  </>;
}

function Import({sourceUrl,setSourceUrl,ownershipConfirmed,setOwnershipConfirmed,importUrl,uploadFile,busy,message,templates,defaultTemplateId,selectedTemplateId,setSelectedTemplateId,activeJobId}) {
  const [job,setJob] = useState(null);
  const [pollError,setPollError] = useState('');
  useEffect(() => {
    if (!activeJobId) return undefined;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const response = await fetch(`${API}/api/jobs/${activeJobId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (active) {
          setJob(data);
          setPollError('');
          if (['completed','failed'].includes(data.status)) clearInterval(timer);
        }
      } catch {
        if (active) setPollError('Could not refresh the download progress. Check that the API is running.');
      }
    };
    poll();
    timer = setInterval(poll, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [activeJobId]);

  return <div className="import-layout">
    <section className="panel import-card">
      <div className="import-icon"><Upload size={26}/></div><p className="eyebrow">NEW PROJECT</p><h2>Import a video</h2><p className="muted">Import only content you own or have permission to use.</p>
      <div className="template-select"><label htmlFor="import-template">Editing template</label><select id="import-template" value={selectedTemplateId} onChange={event=>setSelectedTemplateId(event.target.value)}>{templates.map(template=><option key={template.id} value={template.id}>{template.name}{template.id===defaultTemplateId?' · Default':''}</option>)}</select><small>Applied to this video. First captioned render downloads the 141 MiB Whisper speech model.</small></div>
      <form onSubmit={importUrl}><label htmlFor="source-url">Video link (YouTube, Instagram, or Facebook)</label><div className="url-row"><input id="source-url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="Paste a public video link" /><button className="primary" disabled={busy || !sourceUrl || !ownershipConfirmed}>Import</button></div><label className="import-ownership"><input type="checkbox" checked={ownershipConfirmed} onChange={event=>setOwnershipConfirmed(event.target.checked)}/><span>I own this video or have permission to download and use it. It is public and does not require login.</span></label></form>
      {message && <div className="notice"><Check size={16}/>{message}</div>}
      {job && <DownloadProgress job={job}/>}
      {job?.file_path && ['processing','completed','failed'].includes(job.status) && <div className="source-preview"><div className="preview-heading"><div><b>Imported video</b><small>{job.title}</small></div><div className="preview-actions"><span>{job.status === 'completed' ? 'Ready' : job.status === 'failed' ? 'Processing failed' : 'Processing'}</span><a className="secondary" href={`${API}/api/jobs/${job.id}/download`}><Download size={14}/> Download</a></div></div><video controls preload="metadata" src={`${API}/${job.file_path}`} /></div>}
      {pollError && <div className="assistant-error">{pollError}</div>}
      <div className="divider"><span>OR</span></div>
      <label className="dropzone"><input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv" onChange={uploadFile}/><Upload size={22}/><b>Upload local video</b><span>MP4, MOV, WebM or MKV up to 2 GB</span></label>
    </section>
  </div>;
}

function DownloadProgress({job}) {
  const progress = Math.max(0, Math.min(100, Math.round(job.progress || 0)));
  const active = ['importing','downloading','processing'].includes(job.status);
  const processing = job.status === 'processing';
  const indeterminate = processing || (job.status === 'downloading' && !job.total_bytes);
  const formatBytes = value => {
    if (!value) return 'Size not reported yet';
    const units = ['B','KB','MB','GB'];
    let size = value; let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
    return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  };
  const label = job.status === 'downloading' ? 'Downloading video'
    : processing ? 'Processing video · creating clips'
      : job.status === 'completed' ? 'Video processing complete'
        : job.status === 'failed' ? 'Import failed'
          : 'Preparing import';
  return <div className={`download-progress ${job.status}`}>
    <div className="download-progress-head"><div><b>{label}</b><small>{job.status === 'failed' ? job.error : `${formatBytes(job.downloaded_bytes)}${job.total_bytes ? ` of ${formatBytes(job.total_bytes)}` : ''}`}</small></div><strong>{processing ? <><span className="processing-spinner" aria-hidden="true"/>Working</> : job.status === 'downloading' && !job.total_bytes ? '…' : `${progress}%`}</strong></div>
    <div className="progress-track" role="progressbar" aria-label={processing ? 'Video processing' : 'Video import'} aria-valuetext={indeterminate ? 'In progress' : `${progress}%`} aria-valuenow={indeterminate ? undefined : progress}><i className={indeterminate ? processing ? 'processing' : 'indeterminate' : ''} style={indeterminate ? undefined : {width:`${progress}%`}}/></div>
    {job.status === 'downloading' && job.download_speed > 0 && <small className="download-speed">{formatBytes(job.download_speed)}/s</small>}
    {processing && <small className="processing-hint">Rendering clips and applying the selected template. This may take a few minutes.</small>}
    {active && !processing && <small className="progress-hint">Progress updates automatically</small>}
  </div>;
}

function Clips({clips,templates,approveClip,onDeleted,youtubeConnected,uploadPrivacy,setPage}) {
  const [deletedIds,setDeletedIds] = useState([]);
  const [deletingId,setDeletingId] = useState(null);
  const [uploadingId,setUploadingId] = useState(null);
  const [error,setError] = useState('');
  const [editingClip,setEditingClip] = useState(null);
  const [editSettings,setEditSettings] = useState(null);
  const [editJobId,setEditJobId] = useState(null);
  const [editBusy,setEditBusy] = useState(false);
  const visibleClips = clips.filter(clip => !deletedIds.includes(clip.id));

  useEffect(() => {
    if (!editJobId) return undefined;
    let active = true;
    let timer;
    const poll = async () => {
      try {
        const edit = await fetchJson(`${API}/api/clip-edits/${editJobId}`);
        if (!active || !['completed','failed'].includes(edit.status)) return;
        clearInterval(timer);
        setEditJobId(null);
        setEditBusy(false);
        if (edit.status === 'failed') {
          setError(edit.error || 'Could not edit this clip.');
          return;
        }
        setEditingClip(null);
        await onDeleted();
      } catch (requestError) {
        if (!active) return;
        clearInterval(timer);
        setEditJobId(null);
        setEditBusy(false);
        setError(requestError.message || 'Could not check clip edit status.');
      }
    };
    poll();
    timer = setInterval(poll, 1200);
    return () => { active = false; clearInterval(timer); };
  }, [editJobId]);

  function openEditor(clip) {
    const template = templates.find(item => item.id === clip.template_id);
    const settings = template?.settings || {};
    setEditingClip(clip);
    setEditSettings({
      aspectRatio: settings.aspectRatio || '9:16',
      zoom: Number(settings.zoom) || 1.12,
      captionsEnabled: settings.captionsEnabled !== false,
      captionColor: settings.captionColor || '#FFFFFF',
      captionFontSize: Number(settings.captionFontSize) || 48,
      captionPosition: settings.captionPosition || 'bottom'
    });
    setError('');
  }

  async function saveClipEdit(event) {
    event.preventDefault();
    if (!editingClip || !editSettings) return;
    setEditBusy(true); setError('');
    try {
      const result = await fetchJson(`${API}/api/clips/${editingClip.id}/edit`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({settings:editSettings})
      });
      setEditJobId(result.editId);
    } catch (requestError) {
      setEditBusy(false);
      setError(requestError.message || 'Could not start clip edit.');
    }
  }

  async function uploadClip(clip) {
    setUploadingId(clip.id); setError('');
    try {
      const response = await fetch(`${API}/api/youtube/upload/${clip.id}`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({privacy:uploadPrivacy})
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'YouTube upload failed.');
      await onDeleted();
    } catch (err) {
      setError(err.message || 'YouTube upload failed.');
    } finally {
      setUploadingId(null);
    }
  }

  async function deleteClip(clip) {
    const warning = clip.uploaded
      ? 'Delete this local clip and its record? The copy already uploaded to YouTube will remain online.'
      : 'Permanently delete this clip and its local video file?';
    if (!window.confirm(warning)) return;
    setDeletingId(clip.id); setError('');
    try {
      const response = await fetch(`${API}/api/clips/${clip.id}`, {method:'DELETE'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete clip.');
      setDeletedIds(ids => [...ids, clip.id]);
      onDeleted();
    } catch (err) {
      setError(err.message || 'Could not delete clip.');
    } finally {
      setDeletingId(null);
    }
  }

  return <>
    {error && <div className="assistant-error">{error}</div>}
    <div className="clips-grid">
      {visibleClips.length ? visibleClips.map(clip => <article className="clip" key={clip.id}>
        <div className="clip-video">
          <video className="clip-preview" controls preload="metadata" src={`${API}/${clip.path}`} />
          <div className="clip-duration">{Math.round(clip.duration || 30)}s</div>
        </div>
        <div className="clip-body">
          <div className="clip-status">{clip.uploaded ? 'Uploaded to YouTube' : clip.approved ? 'Approved' : 'Needs review'}</div>
          <h3>{clip.title || 'AI Short'}</h3>
          <p>{clip.description || clip.transcript || 'Transcript pending...'}</p>
          {clip.template_id && <small className="applied-template">Template: {templates.find(template=>template.id===clip.template_id)?.name || 'Saved template'}</small>}
          {clip.youtube_id && <a className="youtube-watch" href={`https://www.youtube.com/watch?v=${encodeURIComponent(clip.youtube_id)}`} target="_blank" rel="noreferrer">Watch on YouTube</a>}
          <div className="clip-actions">
            <button className="secondary" onClick={()=>openEditor(clip)}><Pencil size={14}/> Edit</button>
            <a className="secondary download-clip-link" href={`${API}/api/clips/${clip.id}/download`}><Download size={14}/> Download</a>
            <button className="primary" onClick={()=>approveClip(clip.id)} disabled={clip.approved}>{clip.approved ? 'Approved' : 'Approve'}</button>
            {clip.approved && !clip.uploaded && (youtubeConnected
              ? <button className="primary" onClick={()=>uploadClip(clip)} disabled={uploadingId===clip.id}>{uploadingId===clip.id?'Uploading…':'Upload to YouTube'}</button>
              : <button className="secondary" onClick={()=>setPage('YouTube')}>Connect YouTube</button>)}
            <button className="delete-clip" onClick={()=>deleteClip(clip)} disabled={deletingId===clip.id || uploadingId===clip.id} title="Delete clip"><Trash2 size={15}/><span>{deletingId===clip.id?'Deleting':'Delete'}</span></button>
          </div>
        </div>
      </article>) : <Empty icon={WandSparkles} text="No clips yet. Import a video to begin."/>}
    </div>
    {editingClip && editSettings && <div className="template-modal-backdrop" onClick={event=>{if(!editBusy&&event.target===event.currentTarget)setEditingClip(null);}}>
      <form className="clip-editor panel" onSubmit={saveClipEdit}>
        <div className="template-head">
          <div><p>CLIP EDITOR</p><h2>Edit video framing</h2></div>
          <button type="button" className="secondary" onClick={()=>setEditingClip(null)} disabled={editBusy}>Close</button>
        </div>
        <video className="clip-editor-preview" controls preload="metadata" src={`${API}/${editingClip.path}`}/>
        <label>Aspect ratio
          <select value={editSettings.aspectRatio} onChange={event=>setEditSettings({...editSettings,aspectRatio:event.target.value})}>
            <option value="9:16">9:16 · Shorts / Reels</option>
            <option value="1:1">1:1 · Square</option>
            <option value="16:9">16:9 · Landscape</option>
          </select>
        </label>
        <label>Zoom <span>{Number(editSettings.zoom).toFixed(2)}×</span>
          <input type="range" min="1" max="1.3" step="0.01" value={editSettings.zoom} onChange={event=>setEditSettings({...editSettings,zoom:Number(event.target.value)})}/>
        </label>
        <p className="muted">This renders a new crop for this clip. Existing burned-in captions stay as they are; change caption styling in Templates for future clips.</p>
        {editBusy && <small className="processing-hint">Rendering your edit… Keep this page open until it finishes.</small>}
        <div className="clip-editor-actions"><button type="button" className="secondary" onClick={()=>setEditingClip(null)} disabled={editBusy}>Cancel</button><button className="primary" type="submit" disabled={editBusy}>{editBusy?'Rendering…':'Apply edit'}</button></div>
      </form>
    </div>}
  </>;
}

function Templates({templates,defaultTemplateId,onDefaultChange,refresh}) {
  const [editor,setEditor] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);

  async function request(url, options = {}) {
    const response = await fetch(url, {headers:{'Content-Type':'application/json'}, ...options});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Template request failed.');
    return data;
  }

  async function create() {
    setError('');
    try {
      const created = await request(`${API}/api/templates`, {method:'POST',body:JSON.stringify({name:'New Template',settings:{aspectRatio:'9:16',zoom:1,captionsEnabled:true,captionColor:'#FFFFFF',captionFontSize:48,captionPosition:'bottom'}})});
      setEditor(created);
      refresh();
    } catch (err) { setError(err.message); }
  }

  async function save(event) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true); setError('');
    try {
      await request(`${API}/api/templates/${editor.id}`, {method:'PUT',body:JSON.stringify({name:editor.name,settings:editor.settings})});
      setEditor(null); refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function duplicate(template) {
    setError('');
    try { await request(`${API}/api/templates/${template.id}/duplicate`, {method:'POST'}); refresh(); }
    catch (err) { setError(err.message); }
  }

  async function setDefault(template) {
    setError('');
    try {
      await request(`${API}/api/settings/default-template`, {method:'PUT',body:JSON.stringify({templateId:template.id})});
      onDefaultChange(template.id); refresh();
    } catch (err) { setError(err.message); }
  }

  async function remove(template) {
    if (!window.confirm(`Delete template "${template.name}"? New videos will use another selected template.`)) return;
    setError('');
    try { await request(`${API}/api/templates/${template.id}`, {method:'DELETE'}); refresh(); }
    catch (err) { setError(err.message); }
  }

  return <section className="templates">
    <div className="template-head"><div><p>REUSABLE PRESETS</p><h2>Editing Templates</h2><small>Aspect ratio and zoom are applied when new clips are rendered.</small></div><button className="primary" onClick={create}><Plus size={16}/> New template</button></div>
    {error && <div className="assistant-error">{error}</div>}
    <div className="template-grid">{templates.map(t=><article className="template-card" key={t.id}>
      <div className="template-preview"><div className="fake-phone" style={{aspectRatio:(t.settings?.aspectRatio||'9:16').replace(':',' / '),transform:`scale(${Math.min(1.3,Number(t.settings?.zoom)||1.12)})`}}><span>{t.settings?.aspectRatio || '9:16'}<br/>ZOOM {Number(t.settings?.zoom||1.12).toFixed(2)}×<br/>{t.settings?.captionsEnabled===false?'NO CAPTIONS':'CAPTIONS'}</span></div></div>
      <div className="template-card-info"><b>{t.name}</b><small>{t.settings?.aspectRatio || '9:16'} ratio · Zoom {Number(t.settings?.zoom||1.12).toFixed(2)}× · Captions {t.settings?.captionsEnabled===false?'off':'on'}</small></div>
      <div className="template-actions"><button className="secondary" onClick={()=>setEditor({...t,settings:{aspectRatio:t.settings?.aspectRatio||'9:16',zoom:Number(t.settings?.zoom)||1.12,captionsEnabled:t.settings?.captionsEnabled!==false,captionColor:t.settings?.captionColor||'#FFFFFF',captionFontSize:Number(t.settings?.captionFontSize)||48,captionPosition:t.settings?.captionPosition||'bottom'}})}>Edit</button><button className={t.id===defaultTemplateId?'template-default selected':'template-default'} onClick={()=>setDefault(t)}>{t.id===defaultTemplateId?'Default ✓':'Set default'}</button><button className="secondary" onClick={()=>duplicate(t)}>Duplicate</button><button className="delete-clip" disabled={t.id==='default'} onClick={()=>remove(t)}>Delete</button></div>
    </article>)}</div>
    {editor && <div className="template-modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)setEditor(null);}}><form className="template-editor panel" onSubmit={save}>
      <div className="template-head"><div><p>TEMPLATE EDITOR</p><h2>{editor.id==='default'?'Edit default template':'Edit template'}</h2></div><button type="button" className="secondary" onClick={()=>setEditor(null)}>Close</button></div>
      <label>Template name<input value={editor.name} maxLength={80} onChange={event=>setEditor({...editor,name:event.target.value})}/></label>
      <label>Aspect ratio<select value={editor.settings.aspectRatio} onChange={event=>setEditor({...editor,settings:{...editor.settings,aspectRatio:event.target.value}})}><option value="9:16">9:16 · Shorts vertical</option><option value="1:1">1:1 · Square</option><option value="16:9">16:9 · Landscape</option></select></label>
      <label>Zoom <span>{Number(editor.settings.zoom).toFixed(2)}×</span><input type="range" min="1" max="1.3" step="0.01" value={editor.settings.zoom} onChange={event=>setEditor({...editor,settings:{...editor.settings,zoom:Number(event.target.value)}})}/></label>
      <label className="caption-toggle"><input type="checkbox" checked={editor.settings.captionsEnabled} onChange={event=>setEditor({...editor,settings:{...editor.settings,captionsEnabled:event.target.checked}})}/> Burn spoken captions into video</label>
      <label>Caption position<select value={editor.settings.captionPosition} onChange={event=>setEditor({...editor,settings:{...editor.settings,captionPosition:event.target.value}})}><option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option></select></label>
      <label>Caption font size <span>{editor.settings.captionFontSize}px</span><input type="range" min="24" max="80" step="1" value={editor.settings.captionFontSize} onChange={event=>setEditor({...editor,settings:{...editor.settings,captionFontSize:Number(event.target.value)}})}/></label>
      <label>Caption color<input className="color-input" type="color" value={editor.settings.captionColor} onChange={event=>setEditor({...editor,settings:{...editor.settings,captionColor:event.target.value}})}/></label>
      <p className="muted">Aspect ratio, zoom and speech captions affect clips rendered after you save. First captioned render downloads the 141 MiB Whisper model.</p>
      <button className="primary" type="submit" disabled={busy}>{busy?'Saving…':'Save template'}</button>
    </form></div>}
  </section>;
}

function YouTubeSetup({status,privacy,setPrivacy}) {
  const configured = status?.configured;
  return <section className="panel setup"><div className="youtube-mark"><Youtube size={28}/></div><p className="eyebrow">PUBLISHING</p><h2>Connect YouTube</h2><p className="muted">Authorize your Google account, then approve a clip and choose “Upload to YouTube”. Uploads are private by default.</p><div className="connection"><span>{!configured?'Configuration required':status?.connected?'Connected':'Not connected'}</span><button className="primary" disabled={!configured} onClick={()=>location.href=`${API}/api/youtube/auth?frontendOrigin=${encodeURIComponent(location.origin)}`}>{status?.connected?'Reconnect':'Connect account'}</button></div>{!configured && <p className="youtube-config-help">Add YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI to .env, then restart the API.</p>}<label className="youtube-privacy">Upload privacy<select value={privacy} onChange={event=>setPrivacy(event.target.value)}><option value="private">Private · only you</option><option value="unlisted">Unlisted · link holders</option><option value="public">Public · anyone</option></select></label><small className="youtube-redirect-help">Google OAuth redirect URI: http://localhost:4000/api/youtube/callback</small></section>;
}

function Automation() {
  const [enabled,setEnabled]=useState(false);
  return <section className="panel automation"><p className="eyebrow">WORKFLOW</p><h2>Automation Settings</h2>{[
    ['Automatic clip generation','Create clips after a video finishes processing.',true],
    ['Automatic subtitle generation','Transcribe speech with Whisper.',true],
    ['AI caption generation','Create titles, descriptions and hashtags.',true],
    ['Automatic YouTube publishing','Only approved clips are published when enabled.',enabled]
  ].map(([label,desc,value],i)=><div className="setting" key={label}><div><b>{label}</b><span>{desc}</span></div><button className={`switch ${i===3 && value?'on':i!==3 && value?'on':''}`} onClick={()=>i===3&&setEnabled(v=>!v)}><i/></button></div>)}</section>;
}

function Empty({icon:Icon,text}) { return <div className="empty"><Icon size={24}/><span>{text}</span></div>; }

createRoot(document.getElementById('root')).render(<App />);
