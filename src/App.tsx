/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  Cpu, 
  TrendingUp, 
  Megaphone, 
  Activity, 
  Bell, 
  Search,
  Settings,
  Terminal,
  Circle,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getCEOSummary, summarizeSecurityLogs, generateMarketingIdeas, generateSalesFollowUp } from './services/aiService';

// Types
interface Agent {
  id: string;
  name: string;
  role: string;
  icon: any;
  status: 'Active' | 'Idle' | 'Thinking';
  lastAction: string;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [marketing, setMarketing] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>({
    ceo: null,
    security: null,
    marketing: null
  });
  const [activityFeed, setActivityFeed] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard },
    { id: 'agents', icon: Cpu },
    { id: 'terminal', icon: Terminal },
    { id: 'workflows', icon: Activity },
    { id: 'security', icon: ShieldCheck },
    { id: 'settings', icon: Settings }
  ];

  const agents: Agent[] = [
    { id: 'ceo', name: 'CEO Agent', role: 'Strategic Oversight', icon: LayoutDashboard, status: aiAnalysis.ceo ? 'Active' : 'Thinking', lastAction: 'Generating daily report' },
    { id: 'security', name: 'Security Agent', role: 'Threat Detection', icon: ShieldCheck, status: aiAnalysis.security ? 'Active' : 'Thinking', lastAction: 'Analyzing auth.log' },
    { id: 'ops', name: 'Ops Agent', role: 'System Orchestration', icon: Cpu, status: 'Active', lastAction: 'Balancing edge node load' },
    { id: 'sales', name: 'Sales Agent', role: 'Revenue Generation', icon: TrendingUp, status: 'Active', lastAction: 'Nurturing Global Tech lead' },
    { id: 'marketing', name: 'Marketing Agent', role: 'Growth & Content', icon: Megaphone, status: aiAnalysis.marketing ? 'Active' : 'Thinking', lastAction: 'Ideating campaign' },
  ];

  const fetchData = async () => {
    try {
      const [ovRes, logRes, taskRes, leadRes, markRes] = await Promise.all([
        fetch('/api/overview').then(r => r.json()),
        fetch('/api/logs').then(r => r.json()),
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/leads').then(r => r.json()),
        fetch('/api/marketing').then(r => r.json()),
      ]);

      setOverview(ovRes);
      setLogs(logRes.logs);
      setTasks(taskRes.tasks);
      setLeads(leadRes.leads);
      setMarketing(markRes);

      // Perform AI Analysis on the FE
      const [ceoAi, secAi, markAi] = await Promise.all([
        getCEOSummary({ overview: ovRes }),
        summarizeSecurityLogs(logRes.logs),
        generateMarketingIdeas(markRes)
      ]);

      setAiAnalysis({
        ceo: ceoAi,
        security: secAi,
        marketing: markAi
      });

      setActivityFeed(prev => [
        `[${new Date().toLocaleTimeString()}] CEO Agent: Generated summary report.`,
        `[${new Date().toLocaleTimeString()}] Security Agent: Identified ${secAi.threats?.length || 0} potential vulnerabilities.`,
        `[${new Date().toLocaleTimeString()}] Marketing Agent: Brainstormed 5 new content angles.`,
        ...prev.slice(0, 10)
      ]);

      setLoading(false);
    } catch (error) {
      console.error("Data fetch failed", error);
    }
  };

  const handleGenerateFollowUp = async (lead: any) => {
    setSelectedLead(lead);
    setIsGeneratingEmail(true);
    const email = await generateSalesFollowUp(lead.name, lead.status);
    setSelectedLead((prev: any) => ({ ...prev, email }));
    setIsGeneratingEmail(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-dashboard-bg">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        >
          <Cpu className="w-12 h-12 text-dashboard-accent" />
        </motion.div>
        <p className="mt-4 font-mono text-dashboard-muted animate-pulse">Initializing AI OS Core...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-dashboard-bg text-dashboard-text overflow-hidden border-4 border-dashboard-border">
      {/* Sidebar */}
      <aside className="w-20 border-r border-dashboard-border flex flex-col items-center py-8 space-y-10 bg-[#050505]">
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
          <div className="w-4 h-4 bg-black rounded-sm rotate-45"></div>
        </div>
        
        <nav className="flex flex-col space-y-8 opacity-40">
          {navItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={() => setActiveTab(item.id)}
                className={`w-8 h-8 flex items-center justify-center transition-all transform hover:rotate-12 ${
                  activeTab === item.id 
                    ? 'text-dashboard-accent border-2 border-dashboard-accent opacity-100' 
                    : 'text-white border-2 border-transparent hover:border-white'
                }`}
              >
                <Icon size={20} />
              </button>
            )
          })}
        </nav>

        <div className="mt-auto mb-4 text-[10px] uppercase font-bold tracking-[0.2em] [writing-mode:vertical-lr] rotate-180 opacity-30">
          SYSTEM_ACTIVE
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <header className="p-8 flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-5xl bold-heading tracking-tighter">AETHEL_OS</h1>
            <p className="text-dashboard-success font-mono text-xs tracking-widest uppercase animate-pulse">
              // MULTI-AGENT_AUTONOMOUS_LAYER_V.1.04
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-3xl font-black italic text-white opacity-90">
              {new Date().toLocaleTimeString([], { hour12: false })}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-dashboard-muted font-bold">
              Uptime: 284:12:09
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
        <div className="p-8 pt-0 space-y-6 max-w-7xl mx-auto w-full">
          {/* CEO Panel */}
          <section className="bg-dashboard-card border-l-4 border-dashboard-accent p-6 flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-8">
            <div className="flex-shrink-0 bg-dashboard-accent text-black p-4 font-black text-3xl italic">
              CEO
            </div>
            <div className="flex-1">
              <h2 className="text-xs font-bold text-dashboard-accent uppercase tracking-widest mb-1">Intelligence Summary</h2>
              <p className="text-xl font-medium leading-tight text-gray-200">
                {aiAnalysis.ceo?.summary || 'Aggregating metrics and core intelligence...'}
              </p>
            </div>
            <div className="w-full md:w-48 text-right">
              <div className="text-xs text-dashboard-muted font-bold uppercase mb-1">Current Priority</div>
              <div className="text-lg font-black text-white uppercase tracking-tighter">
                {aiAnalysis.ceo?.priorities?.[0] || 'SYNCING_LAYER'}
              </div>
            </div>
          </section>

          {/* Agent Analysis Section */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {agents.map((agent, i) => {
              const accentColor = 
                agent.id === 'security' ? 'text-dashboard-alert' :
                agent.id === 'marketing' ? 'text-dashboard-success' :
                agent.id === 'sales' ? 'text-dashboard-warning' :
                agent.id === 'ceo' ? 'text-dashboard-accent' : 'text-white';
              
              const barColor = 
                agent.id === 'security' ? 'bg-dashboard-alert' :
                agent.id === 'marketing' ? 'bg-dashboard-success' :
                agent.id === 'sales' ? 'bg-dashboard-warning' :
                agent.id === 'ceo' ? 'bg-dashboard-accent' : 'bg-white';

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={agent.id}
                  className="brutalist-card p-4 group hover:border-dashboard-accent"
                >
                  <div className="text-[10px] font-bold text-dashboard-muted uppercase tracking-widest mb-4 truncate">
                    {agent.id}_Agent
                  </div>
                  <div className={`text-4xl font-black mb-2 ${accentColor}`}>
                    {agent.id === 'security' ? (aiAnalysis.security?.threats?.length > 0 ? 'RISK' : 'SAFE') :
                     agent.id === 'marketing' ? '92%' :
                     agent.id === 'sales' ? leads.length :
                     agent.id === 'ops' ? 'IDLE' : 'ON'}
                  </div>
                  <div className="h-1 w-full bg-white/10 mb-4 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: agent.id === 'security' ? '85%' : '44%' }}
                      className={`h-full ${barColor}`} 
                    />
                  </div>
                  <p className="mono-label text-dashboard-muted leading-relaxed">
                    Status: {agent.status}<br />
                    L_Action: {agent.lastAction}
                  </p>
                </motion.div>
              );
            })}
          </section>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Terminal Feed */}
            <div className="flex-[2] brutalist-card p-4 overflow-hidden border-[#222]">
              <div className="flex justify-between border-b border-dashboard-border pb-2 mb-2">
                <span className="mono-label text-dashboard-muted font-bold">Security_Terminal_Log</span>
                <span className="text-dashboard-success mono-label animate-pulse">LIVE_FEED</span>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-gray-400">
                {logs.map((log, i) => (
                  <p key={i}>
                    <span className="text-dashboard-muted">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>{' '}
                    <span className={log.includes('Failed') ? 'text-dashboard-alert' : 'text-dashboard-accent'}>{log}</span>
                  </p>
                ))}
              </div>
            </div>

            {/* Sidebar Notifications */}
            <div className="flex-1 brutalist-card p-4">
              <div className="text-xs font-black uppercase tracking-widest mb-4 text-dashboard-alert">
                ! Notifications
              </div>
              <div className="space-y-3">
                {aiAnalysis.security?.threats?.slice(0, 3).map((threat: any, i: number) => (
                   <div key={i} className="border-l-2 border-dashboard-alert pl-3 py-1">
                     <div className="text-[10px] font-bold uppercase text-dashboard-muted">Security</div>
                     <div className="text-xs font-medium">{threat.type}</div>
                   </div>
                ))}
                <div className="border-l-2 border-dashboard-accent pl-3 py-1">
                   <div className="text-[10px] font-bold uppercase text-dashboard-muted">CEO</div>
                   <div className="text-xs font-medium">Daily Strategy Ready</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sales Management */}
            <section className="flex-1 brutalist-card">
              <div className="px-4 py-3 border-b border-dashboard-border flex justify-between items-center text-dashboard-warning">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} />
                  <h3 className="mono-label font-bold">Sales_Pipeline</h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {leads.map(lead => (
                  <div 
                    key={lead.id} 
                    onClick={() => handleGenerateFollowUp(lead)}
                    className="p-3 border border-dashboard-border bg-black/40 hover:border-dashboard-warning cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold uppercase">{lead.name}</span>
                      <span className="text-[10px] text-dashboard-success">{lead.value}</span>
                    </div>
                    {selectedLead?.id === lead.id && selectedLead.email && (
                      <div className="mt-2 p-2 bg-dashboard-warning/10 border border-dashboard-warning/30 text-[9px] italic text-gray-400">
                        Agent: Message generated.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Operations Management */}
            <section className="flex-[2] brutalist-card">
              <div className="px-4 py-3 border-b border-dashboard-border flex justify-between items-center text-purple-500">
                <div className="flex items-center gap-2">
                  <Cpu size={14} />
                  <h3 className="mono-label font-bold">Ops_Orchestrator</h3>
                </div>
              </div>
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-left font-mono text-[9px]">
                  <thead>
                    <tr className="text-dashboard-muted border-b border-dashboard-border">
                      <th className="pb-2 pr-4 uppercase">Task</th>
                      <th className="pb-2 px-4 uppercase">Status</th>
                      <th className="pb-2 pl-4 text-right uppercase">Deadline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashboard-border">
                    {tasks.map(task => (
                      <tr key={task.id} className="hover:bg-white/5">
                        <td className="py-2 pr-4 font-bold text-white uppercase">{task.title}</td>
                        <td className={`py-2 px-4 ${task.status === 'Completed' ? 'text-dashboard-success' : 'text-dashboard-alert'}`}>
                          [{task.status.toUpperCase()}]
                        </td>
                        <td className="py-2 pl-4 text-right text-dashboard-muted">{task.deadline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
        )}

        {/* Other Tabs */}
        {activeTab === 'agents' && (
          <div className="p-8 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
            {agents.map(agent => (
               <div key={agent.id} className="brutalist-card p-6">
                  <h3 className="font-bold text-2xl mb-2 text-white uppercase">{agent.name}</h3>
                  <p className="text-dashboard-muted mb-4 mono-label">{agent.role}</p>
                  <div className="flex justify-between items-center bg-white/5 p-3 border border-dashboard-border">
                     <span className="mono-label">Status</span>
                     <span className="text-dashboard-success font-mono">[{agent.status.toUpperCase()}]</span>
                  </div>
               </div>
            ))}
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="flex-1 brutalist-card p-6 m-8 mt-0 bg-black text-[#00ff41] font-mono overflow-auto border-[#222]">
            <h2 className="text-xl font-bold mb-4 uppercase text-white">System_Terminal_v2</h2>
            {activityFeed.map((m, i) => (
               <div key={'m' + i} className="mb-2 text-dashboard-muted"> {`>`} {m}</div>
            ))}
            {logs.map((l, i) => (
               <div key={i} className="mb-2"> {`>`} {l}</div>
            ))}
          </div>
        )}

        {activeTab === 'workflows' && (
          <div className="m-8 mt-0 brutalist-card p-6 max-w-7xl mx-auto w-full">
             <div className="flex items-center gap-2 mb-6 text-purple-500">
                <Activity size={20} />
                <h2 className="text-2xl font-black uppercase text-white">Active_Workflows</h2>
             </div>
             <table className="w-full text-left font-mono text-[10px]">
                <thead>
                  <tr className="text-dashboard-muted border-b border-dashboard-border">
                    <th className="pb-3 pr-4 uppercase">Task</th>
                    <th className="pb-3 px-4 uppercase">Status</th>
                    <th className="pb-3 px-4 uppercase">Priority</th>
                    <th className="pb-3 pl-4 text-right uppercase">Deadline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashboard-border">
                  {tasks.map(task => (
                    <tr key={task.id} className="hover:bg-white/5">
                      <td className="py-3 pr-4 font-bold text-white uppercase">{task.title}</td>
                      <td className={`py-3 px-4 ${task.status === 'Completed' ? 'text-dashboard-success' : 'text-dashboard-warning'}`}>
                        [{task.status.toUpperCase()}]
                      </td>
                      <td className="py-3 px-4 text-dashboard-muted">{task.priority}</td>
                      <td className="py-3 pl-4 text-right text-dashboard-muted">{task.deadline}</td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="p-8 pt-0 max-w-7xl mx-auto w-full space-y-6">
             <div className="brutalist-card p-6 border-dashboard-alert mb-6">
                 <h2 className="text-xl font-black uppercase text-dashboard-alert mb-2">Threat Analysis Overview</h2>
                 <p className="text-dashboard-muted mono-label">{aiAnalysis.security?.summary}</p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {aiAnalysis.security?.threats?.map((threat: any, i: number) => (
                  <div key={i} className="brutalist-card p-6 border-dashboard-alert">
                     <h3 className="text-dashboard-alert font-bold uppercase mb-2 text-lg">{threat.type}</h3>
                     <p className="text-dashboard-muted mb-4 text-sm">{threat.description}</p>
                     <div className="bg-dashboard-alert/10 text-dashboard-alert p-3 font-mono text-xs border border-dashboard-alert/30">
                       RECO: {threat.recommendation}
                     </div>
                  </div>
               ))}
               {(!aiAnalysis.security?.threats || aiAnalysis.security?.threats?.length === 0) && (
                 <div className="text-dashboard-success mono-label p-6 brutalist-card text-center col-span-2">No active threats detected. System secure.</div>
               )}
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
           <div className="m-8 mt-0 brutalist-card p-6 max-w-2xl mx-auto w-full border-dashboard-muted/30">
              <div className="flex items-center gap-2 mb-6 text-dashboard-muted">
                 <Settings size={20} />
                 <h2 className="text-2xl font-black uppercase text-white">System Configuration</h2>
              </div>
              <div className="space-y-8">
                 <div>
                    <label className="mono-label block mb-3 text-dashboard-muted text-xs">GEMINI_API_KEY Configured</label>
                    <div className="p-4 bg-dashboard-success/10 border border-dashboard-success flex justify-between items-center text-dashboard-success font-mono text-sm">
                       <span>status: verified & active</span>
                       <ShieldCheck size={18} />
                    </div>
                 </div>
                 <div>
                    <label className="mono-label block mb-3 text-dashboard-muted text-xs">Auto-Purge Security Logs</label>
                    <div className="flex items-center gap-4">
                       <button className="px-6 py-2 bg-dashboard-alert text-black font-bold uppercase text-xs hover:bg-red-400 transition-colors">Enabled</button>
                       <button className="px-6 py-2 bg-transparent border border-dashboard-border text-dashboard-muted hover:text-white font-bold uppercase text-xs transition-colors">Disabled</button>
                    </div>
                 </div>
                 <div>
                    <label className="mono-label block mb-3 text-dashboard-muted text-xs">AI Insight Refresh Rate</label>
                    <select className="w-full p-4 bg-black border border-dashboard-border text-white font-mono text-sm outline-none focus:border-dashboard-accent">
                       <option>30_SECONDS</option>
                       <option>1_MINUTE</option>
                       <option>5_MINUTES</option>
                    </select>
                 </div>
              </div>
           </div>
        )}
        
        <footer className="p-8 border-t border-dashboard-border flex justify-between items-center text-[10px] text-dashboard-muted font-mono">
           <div className="flex gap-4">
              <span>UPTIME: 14D 02H 45M</span>
              <span>NODE: us-east-core-04</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-dashboard-success" />
             AI OS CORE SYNCED
           </div>
        </footer>
      </main>
    </div>
  );
}
