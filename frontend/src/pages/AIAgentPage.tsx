import { Bot, CircleHelp, SendHorizontal, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, PageHeading } from '../components/ui'
import { api, type AgentAnswer, type Site } from '../services/api'

const suggestedQuestions = [
  'What observations are available for this site?',
  'Show the latest environmental observations.',
  'Which FHIR resources exist for this site?',
  'Why did this resource fail validation?',
  'Which fields are missing?',
  'Create a summary of the available observations.',
]

interface ConversationItem {
  role: 'user' | 'agent'
  text: string
  result?: AgentAnswer
  timestamp: string
}

export function AIAgentPage() {
  const [searchParams] = useSearchParams()
  const [sites, setSites] = useState<Site[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [siteId, setSiteId] = useState(searchParams.get('site') ?? '')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ConversationItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activity, setActivity] = useState<AgentAnswer | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true
    api.getSites().then((data) => { if (active) { setSites(data.items); setSiteId((current) => current || data.items[0]?.id || '') } })
      .catch(() => { if (active) setError('The OneAquaHealth site list is unavailable.') })
      .finally(() => { if (active) setSitesLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, busy])
  async function ask(question = draft) {
    const text = question.trim()
    if (!text || busy) return
    setDraft(''); setError(''); setBusy(true); setActivity(null)
    setMessages((current) => [...current, { role: 'user', text, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    try {
      const result = await api.queryAgent(text, siteId || undefined)
      setActivity(result)
      setMessages((current) => [...current, { role: 'agent', text: result.answer, result, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The agent request failed.')
    } finally { setBusy(false) }
  }
  return <>
    <PageHeading eyebrow="CONTROLLED TOOL AGENT / GEMINI" title="One Health AI Agent" description="Ask questions about connected OneAquaHealth source records and generated FHIR resources. Answers are grounded in backend tool results." action={<label className="select-control"><span className="select-label">SITE</span><select value={siteId} disabled={sitesLoading || sites.length === 0} onChange={(event) => setSiteId(event.target.value)} aria-label="Select site">{sitesLoading && <option value="">Loading sites...</option>}{!sitesLoading && sites.length === 0 && <option value="">No sites available</option>}{sites.map((site) => <option key={site.id} value={site.id}>{site.id} · {site.name}</option>)}</select></label>} />
    {error && <ErrorState message={error} />}
    {sitesLoading && <LoadingState message="Loading site catalogue..." />}
    <div className="agent-layout">
      <aside className="agent-history panel-card">
        <div className="eyebrow">SESSION</div>
        <h2>Research queries</h2>
        <button className="history-item active"><span className="history-indicator"><MessageIcon /></span><span><strong>Current session</strong><small>{messages.length} exchanges</small></span></button>
        <div className="agent-safety"><ShieldCheck size={17} /><span>Backend tools only<small>No direct database or OAH access by the model</small></span></div>
        <div className="agent-source-hint"><strong>CONNECTED SOURCE</strong><small>api.enora-oah.eu</small><small>Citizen observations are not integrated.</small></div>
      </aside>
      <section className="agent-conversation panel-card">
        <div className="conversation-header"><div className="agent-avatar"><Bot size={18} /></div><div><strong>AquaManFHIR Data Agent</strong><small><span className="live-dot" /> Grounded responses · selected site {siteId || '—'}</small></div><span className="provider-mark">GEMINI</span></div>
        <div className="conversation-thread" ref={threadRef}>
          {messages.length === 0 && <div className="agent-welcome"><span className="welcome-icon"><Sparkles size={20} /></span><h2>Query connected data</h2><p>Ask about a site or FHIR resource. Source identifiers and tool activity are shown separately.</p>{!sitesLoading && sites.length === 0 ? <EmptyState title="No sites available" detail="The connected source returned no research sites to query." /> : !sitesLoading && <div className="prompt-list">{suggestedQuestions.map((prompt) => <button key={prompt} onClick={() => void ask(prompt)} disabled={busy}><span>{prompt}</span><SendHorizontal size={14} /></button>)}</div>}</div>}
          {messages.map((message, index) => <div className={`message-row message-${message.role}`} key={`${message.timestamp}-${index}`}>
            <div className="message-avatar">{message.role === 'agent' ? <Bot size={15} /> : 'R'}</div>
            <div className="message-content">
              <div className="message-meta">{message.role === 'agent' ? 'AQUAMANFHIR AGENT' : 'YOU'} <span>{message.timestamp}</span></div>
              {message.role === 'agent' ? <div className="agent-answer"><ReactMarkdown>{message.text}</ReactMarkdown></div> : <p>{message.text}</p>}
              {message.result && message.result.sources.length > 0 && <div className="answer-trace-note">Grounded in {message.result.sources.length} source identifiers. See Agent activity for details.</div>}
            </div>
          </div>)}
          {busy && <div className="message-row message-agent"><div className="message-avatar"><Bot size={15} /></div><div className="thinking-state"><span /><span /><span />Running controlled data tools…</div></div>}
        </div>
        <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void ask() }}><textarea aria-label="Ask the One Health data agent" placeholder="Ask about this site's source data, FHIR resources, or validation…" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} rows={2} /><button className="btn btn-primary" type="submit" disabled={busy || !draft.trim()} aria-label="Send question"><SendHorizontal size={17} /></button><small><CircleHelp size={12} /> Gemini API key remains on the backend.</small></form>
      </section>
      <aside className="agent-activity panel-card">
        <div className="eyebrow">TRACE / LAST RESPONSE</div>
        <h2>Agent activity</h2>
        {activity ? <>
          <div className="activity-stack">{activity.toolsUsed.map((tool, index) => <div className="activity-row" key={`${tool}-${index}`}><span className="activity-check">✓</span><span>{formatToolName(tool)}</span></div>)}</div>
          <div className="activity-sources">
            <strong>SOURCE IDENTIFIERS · {activity.sources.length}</strong>
            {activity.sources.length > 0 ? <>
              <div className="activity-source-preview">{activity.sources.slice(0, 5).map((source) => <code key={source}>{source}</code>)}</div>
              {activity.sources.length > 5 && <details className="activity-source-details"><summary>Show {activity.sources.length - 5} more identifiers</summary><div>{activity.sources.slice(5).map((source) => <code key={source}>{source}</code>)}</div></details>}
            </> : <small>No resource identifiers were returned.</small>}
          </div>
        </> : <div className="activity-empty"><Wrench size={18} /><span>Tool execution appears here after the agent responds.</span></div>}
        <div className="activity-safety"><ShieldCheck size={14} /> No diagnoses or clinical advice.</div>
      </aside>
    </div>
  </>
}

function formatToolName(tool: string) {
  return tool.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

function MessageIcon() {
  return <SendHorizontal size={15} />
}
