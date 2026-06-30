import { useEffect, useState } from 'react';
import { RefreshCw, Trash2, MessageSquare, Zap, Layers, Cpu } from 'lucide-react';
import GraphScene from './GraphScene';
import { useGraphData } from './useGraphData';
import type { GraphNode } from './types';

interface ServerStatus {
  main_imported: boolean;
  opencode_available: boolean;
  connected: boolean;
  memory_count: number;
}

function NodeDetail({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <div className="absolute top-14 right-4 w-80 max-h-[80vh] overflow-auto rounded-xl border border-border bg-panel/90 backdrop-blur-md p-4 shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary">{node.label}</h3>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-white">× cerrar</button>
      </div>
      <p className="text-xs text-slate-300 mb-2 font-mono">{node.name}</p>
      {node.text_preview && (
        <div className="mb-3 rounded-lg bg-black/40 p-3">
          <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{node.text_preview}</p>
        </div>
      )}
      {node.user_prompt && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">User</p>
          <p className="text-xs text-slate-300 whitespace-pre-wrap">{node.user_prompt}</p>
        </div>
      )}
      {node.assistant_response && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Assistant</p>
          <p className="text-xs text-slate-300 whitespace-pre-wrap">{node.assistant_response}</p>
        </div>
      )}
      <div className="mt-3 flex gap-2 text-[10px] text-slate-500">
        <span>ID: {node.id}</span>
        <span>Color: #{node.color.toString(16)}</span>
      </div>
    </div>
  );
}

function Stats({ memoryCount, nodeCount, edgeCount }: { memoryCount: number; nodeCount: number; edgeCount: number }) {
  const items = [
    { icon: MessageSquare, label: 'Turnos', value: memoryCount },
    { icon: Layers, label: 'Nodos', value: nodeCount },
    { icon: Zap, label: 'Aristas', value: edgeCount },
  ];
  return (
    <div className="absolute bottom-4 left-4 flex gap-3">
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="flex items-center gap-2 rounded-lg border border-border bg-panel/80 px-3 py-2 backdrop-blur-sm"
        >
          <Icon size={14} className="text-primary" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-sm font-mono font-semibold">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

interface StreamingResponse {
  user: string;
  text: string;
  used_main: boolean;
  done: boolean;
}

export default function App() {
  const { data, loading, error, fetchGraph } = useGraphData();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [streaming, setStreaming] = useState<StreamingResponse | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchGraph();
    fetchStatus();
  }, [fetchGraph]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    setChatError(null);
    setStreaming({ user: message, text: '', used_main: false, done: false });

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        setChatError(body.detail || body.error || 'Error de streaming');
        setStreaming(null);
        setSending(false);
        return;
      }

      setMessage('');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let usedMain = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE messages end with double newline
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const msg of messages) {
          const dataLine = msg.split('\n').find((line) => line.startsWith('data:'));
          if (!dataLine) continue;
          const payload = dataLine.replace('data: ', '');
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'chunk') {
              fullText += parsed.text;
              setStreaming((prev) => (prev ? { ...prev, text: fullText, used_main: usedMain } : null));
            } else if (parsed.type === 'done') {
              fullText = parsed.response || fullText;
              usedMain = parsed.used_main ?? usedMain;
              setStreaming((prev) => (prev ? { ...prev, text: fullText, used_main: usedMain, done: true } : null));
            } else if (parsed.type === 'error') {
              setChatError(parsed.error || 'Error en streaming');
            }
          } catch (e) {
            console.error('Error parsing SSE:', e, payload);
          }
        }
      }

      await fetchGraph();
      fetchStatus();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Error de red');
      setStreaming(null);
    } finally {
      setSending(false);
    }
  };

  const clearMemory = async () => {
    await fetch('/api/clear', { method: 'POST' });
    setSelectedNode(null);
    fetchGraph();
    fetchStatus();
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 flex h-12 items-center justify-between border-b border-border bg-panel/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-semibold tracking-tight">Cerebro UI</span>
          <span className="text-[10px] rounded-full border border-border px-2 py-0.5 text-slate-400">galaxia de memoria</span>
          {status && (
            <span
              title={status.connected ? 'Usando IA real (main.py)' : 'Modo eco: main.py no detectado o opencode no disponible'}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                status.connected
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              }`}
            >
              <Cpu size={10} />
              {status.connected ? 'IA real' : 'Modo eco'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchGraph}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-border bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
          <button
            onClick={clearMemory}
            className="flex items-center gap-1.5 rounded-md border border-red-900/50 bg-red-900/20 px-3 py-1.5 text-xs text-red-200 hover:bg-red-900/30"
          >
            <Trash2 size={12} />
            Limpiar
          </button>
        </div>
      </header>

      {/* Panel de respuesta en streaming */}
      {streaming && (
        <div className="absolute bottom-20 right-4 z-10 w-96 max-h-[45vh] overflow-auto rounded-xl border border-border bg-panel/95 p-4 backdrop-blur-md shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">{streaming.done ? 'Última respuesta' : 'Cerebro está pensando...'}</span>
              {!streaming.done && (
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              )}
            </div>
            <button
              onClick={() => setStreaming(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="mb-3 rounded-lg bg-black/30 p-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Tú</p>
            <p className="text-xs text-slate-200 whitespace-pre-wrap">{streaming.user}</p>
          </div>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] uppercase tracking-wider text-primary">Cerebro</p>
              {streaming.used_main ? (
                <span className="text-[9px] rounded-full bg-green-500/20 px-1.5 py-0.5 text-green-300">IA real</span>
              ) : (
                <span className="text-[9px] rounded-full bg-amber-500/20 px-1.5 py-0.5 text-amber-300">Eco</span>
              )}
            </div>
            <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap min-h-[1.5em]">
              {streaming.text}
              {!streaming.done && (
                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary align-middle" />
              )}
            </p>
          </div>
        </div>
      )}

      {/* Chat input flotante */}
      <div className="absolute bottom-4 right-4 z-10 w-96 rounded-xl border border-border bg-panel/90 p-2 backdrop-blur-md shadow-2xl">
        {chatError && (
          <div className="mb-2 rounded-lg bg-red-900/30 px-2 py-1.5 text-[11px] text-red-200">
            {chatError}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={status?.connected ? 'Habla con Cerebro...' : 'Modo eco — escribe algo de prueba...'}
            className="flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-primary"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !message.trim()}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-black hover:bg-sky-300 disabled:opacity-50"
          >
            {sending ? '...' : 'Enviar'}
          </button>
        </div>
      </div>

      {/* Grafo */}
      <div className="h-full w-full pt-12">
        {error && (
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-red-900/50 bg-red-900/20 px-6 py-4 text-center">
            <p className="text-sm text-red-200">{error}</p>
            <button onClick={fetchGraph} className="mt-2 text-xs text-slate-300 underline">Reintentar</button>
          </div>
        )}
        {data && (
          <GraphScene
            data={data}
            selectedNode={selectedNode}
            onNodeClick={setSelectedNode}
            thinking={sending}
          />
        )}
      </div>

      {/* Panel de detalle */}
      {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />}

      {/* Stats */}
      {data && <Stats memoryCount={data.nodes.filter((n) => n.label === 'Session').length} nodeCount={data.nodes.length} edgeCount={data.edges.length} />}
    </div>
  );
}
