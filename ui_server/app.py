"""
app.py — UI server para visualizar la memoria de la IA.

Servidor FastAPI que expone:
  - /api/chat        → enviar mensaje (blocking, legacy)
  - /api/chat/stream → enviar mensaje con SSE (streaming en tiempo real)
  - /api/memory      → devolver memoria actual
  - /api/graph       → grafo calculado desde memory
  - /api/layout      → grafo con posiciones 3D
  - /                → frontend React embebido
"""

import asyncio
import json
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ui_server import graph_builder, memory_store

# Intentar importar main.py para reutilizar su memoria y save_memory().
# Esto requiere que el bucle interactivo de main.py esté protegido con
# `if __name__ == "__main__":` (ya hecho). Si no se puede importar,
# el UI funciona en modo independiente con su propia memoria.
try:
    import main as main_module
    _MAIN_IMPORTED = True
except Exception as e:
    main_module = None
    _MAIN_IMPORTED = False

# main.py es importable, pero save_memory() llama al binario `opencode`.
# Si no está disponible en PATH, no intentamos usar la IA real para evitar
# que el servidor se cuelgue esperando un proceso inexistente/interactivo.
_OPENCODE_AVAILABLE = shutil.which("opencode") is not None
MAIN_AVAILABLE = _MAIN_IMPORTED and _OPENCODE_AVAILABLE


class ChatMessage(BaseModel):
    message: str


# Ruta al frontend compilado (si existe)
STATIC_DIR = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if MAIN_AVAILABLE and main_module is not None and main_module.memory:
        # Sincronizar con la memoria real de main.py
        memory_store.MEMORY = main_module.memory
    elif not memory_store.get_memory():
        # Seed con una conversación de ejemplo para que la UI no arranque vacía
        memory_store.append_interaction(
            "Hola, ¿quién eres?",
            "Soy Cerebro, tu asistente local. Estoy aprendiendo de cada conversación.",
        )
        memory_store.append_interaction(
            "Explícame qué es esta UI",
            "Es una galaxia interactiva que visualiza nuestros mensajes como nodos y conexiones.",
        )
    yield


app = FastAPI(title="Cerebro UI", lifespan=lifespan)

# CORS solo para desarrollo local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/memory")
def get_memory():
    return {"memory": memory_store.get_memory(), "count": len(memory_store.get_memory())}


@app.get("/api/status")
def status():
    return {
        "main_imported": _MAIN_IMPORTED,
        "opencode_available": _OPENCODE_AVAILABLE,
        "connected": MAIN_AVAILABLE,
        "memory_count": len(memory_store.get_memory()),
    }


def _build_context(user_msg: str) -> str:
    """Construye el mismo contexto que main.save_memory() usa."""
    memory = memory_store.get_memory()
    context = "\n".join(memory[-9:])
    return f"{context}\n{user_msg}"


def _save_to_both_memories(user_msg: str, response: str) -> None:
    """Guarda un turno en memory_store y, si es posible, en main.memory."""
    entry = f"User: {user_msg}\nAssistant: {response}"
    memory_store.MEMORY.append(entry)
    while len(memory_store.MEMORY) > 10:
        memory_store.MEMORY.pop(0)
    if MAIN_AVAILABLE and main_module is not None:
        main_module.memory.append(entry)
        while len(main_module.memory) > 10:
            main_module.memory.pop(0)


async def _stream_opencode(user_msg: str) -> AsyncGenerator[str, None]:
    """Ejecuta opencode en streaming y emite líneas de texto."""
    full_context = _build_context(user_msg)
    proc = subprocess.Popen(
        ["opencode", "run", full_context],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )

    def read_stdout():
        if proc.stdout is None:
            return None
        return proc.stdout.readline()

    try:
        while True:
            line = await asyncio.to_thread(read_stdout)
            if not line:
                break
            yield line
    finally:
        try:
            proc.wait(timeout=30)
        except Exception:
            proc.kill()


@app.post("/api/chat")
async def chat(body: ChatMessage):
    user_msg = body.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="El mensaje está vacío")

    response = ""
    used_main = False

    if MAIN_AVAILABLE and main_module is not None:
        # Llamar a la IA real. save_memory() ejecuta opencode, por lo que
        # corremos en un thread para no bloquear el event loop de FastAPI.
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(main_module.save_memory, user_msg),
                timeout=30.0,
            )
            used_main = True
            # Asegurar que memory_store apunte a la lista compartida de main.py
            memory_store.MEMORY = main_module.memory
        except Exception as e:
            # Fallback a eco para que la UI nunca se rompa
            response = f"Eco de Cerebro (fallback): {user_msg}"
            memory_store.append_interaction(user_msg, response)
    else:
        # Modo standalone: respuesta simulada
        response = f"Eco de Cerebro: {user_msg}"
        memory_store.append_interaction(user_msg, response)

    return {
        "response": response,
        "memory_count": len(memory_store.get_memory()),
        "used_main": used_main,
    }


@app.post("/api/chat/stream")
async def chat_stream(request: Request, body: ChatMessage):
    user_msg = body.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="El mensaje está vacío")

    async def event_generator() -> AsyncGenerator[str, None]:
        """Genera eventos SSE: chunks de texto + evento final done/error."""
        chunks: list[str] = []
        used_main = False

        try:
            if MAIN_AVAILABLE and _OPENCODE_AVAILABLE:
                used_main = True
                async for chunk in _stream_opencode(user_msg):
                    chunks.append(chunk)
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"
            else:
                # Modo eco con streaming simulado
                eco = f"Eco de Cerebro: {user_msg}"
                for word in eco.split(" "):
                    chunk = word + " "
                    chunks.append(chunk)
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"
                    await asyncio.sleep(0.05)

            full_response = "".join(chunks).strip()
            _save_to_both_memories(user_msg, full_response)

            yield f"data: {json.dumps({'type': 'done', 'response': full_response, 'used_main': used_main, 'memory_count': len(memory_store.get_memory())})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/graph")
def get_graph(max_nodes: int = 2000):
    memory = memory_store.get_memory()
    graph = graph_builder.build_graph(memory, max_nodes=max_nodes)
    return JSONResponse(content=graph)


@app.get("/api/layout")
def get_layout(max_nodes: int = 2000):
    memory = memory_store.get_memory()
    graph = graph_builder.build_graph(memory, max_nodes=max_nodes)
    layout = graph_builder.compute_layout(graph)
    return JSONResponse(content=layout)


@app.post("/api/clear")
def clear():
    memory_store.clear_memory()
    if MAIN_AVAILABLE and main_module is not None:
        # Mantener consistencia con main.py
        main_module.memory.clear()
    return {"ok": True}


# Servir frontend estático si existe, si no devolver info
if STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    @app.get("/")
    def root():
        return {
            "message": "Cerebro UI server activo",
            "endpoints": ["/api/health", "/api/memory", "/api/chat", "/api/graph", "/api/layout", "/api/clear"],
            "frontend": "Aún no compilado. Ejecuta 'cd ui && npm run build' y copia 'dist/' a 'ui_server/static/'.",
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("ui_server.app:app", host="127.0.0.1", port=8000, reload=False)
