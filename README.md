# Cerebro UI — Galaxia de memoria

Visualizador 3D para la memoria de tu IA local. Inspirado en [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) pero adaptado para `memory = []` de Python.

## Qué hace

- Convierte cada turno de conversación (`User: ...\nAssistant: ...`) en nodos y aristas.
- Renderiza una **galaxia 3D interactiva** con WebGL/Bloom.
- Permite chatear desde la UI, actualizando el grafo en tiempo real.
- Funciona **sin modificar `main.py`** en modo independiente.

## Estructura

```
ui_server/           # Backend Python
├── app.py           # FastAPI + endpoints
├── memory_store.py  # memory = [] del UI
└── graph_builder.py # memory → grafo 3D

ui/                  # Frontend React + Three.js
├── src/
│   ├── App.tsx
│   ├── GraphScene.tsx
│   ├── hooks/useGraphData.ts
│   └── types.ts
└── package.json
```

## Instalación

### 1. Backend

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements-ui.txt
```

### 2. Frontend

```bash
cd ui
npm install
```

## Uso en desarrollo

### Terminal 1: backend

```bash
.venv\Scripts\activate
python -m ui_server.app
```

El servidor corre en `http://127.0.0.1:8000`.

### Terminal 2: frontend

```bash
cd ui
npm run dev
```

Abre `http://localhost:5173`.

## Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/health` | GET | Estado del servidor |
| `/api/memory` | GET | Ver memoria actual |
| `/api/chat` | POST | Enviar mensaje (guarda en memoria del UI) |
| `/api/graph` | GET | Grafo sin posiciones 3D |
| `/api/layout` | GET | Grafo con posiciones 3D |
| `/api/clear` | POST | Limpiar memoria |

## Producción (frontend embebido)

```bash
cd ui
npm run build
xcopy /E /I dist\* ..\ui_server\static\
```

Luego:

```bash
python -m ui_server.app
```

Y abre `http://127.0.0.1:8000`.

## Conexión con `main.py` (YA IMPLEMENTADA)

El UI server intenta importar `main.py` automáticamente al arrancar. Para que esto funcione, el bucle interactivo final de `main.py` está protegido con:

```python
if __name__ == "__main__":
    while True:
        message = input("You: ")
        # ... resto del bloque
```

Esto NO cambia la lógica de tu IA; solo la hace importable.

### Comportamiento

- Si `main.py` es importable **y** el comando `opencode` está en `PATH`:
  - `POST /api/chat` llama a `main.save_memory(message)`.
  - La respuesta real de la IA se muestra en la UI.
  - `memory = []` se comparte entre `main.py` y el UI server.
  - La badge superior muestra **IA real**.

- Si `main.py` no es importable o `opencode` no está disponible:
  - El UI funciona en **modo eco** con respuestas simuladas.
  - La badge superior muestra **Modo eco**.

### Verificar conexión

```bash
curl http://127.0.0.1:8000/api/status
```

Responde algo como:

```json
{"main_imported": true, "opencode_available": true, "connected": true, "memory_count": 1}
```

## Personalización

- Colores por tipo de nodo: `ui_server/graph_builder.py` → `COLORS`.
- Tamaños: `ui_server/graph_builder.py` → `_size_for_label()`.
- Límite de nodos: variable `max_nodes` en `/api/layout`.
- Render: `CBM_UI_MAX_RENDER_NODES` (futuro) o ajustar `GRAPH_RENDER_NODE_LIMIT` en `useGraphData.ts`.

## Roadmap sugerido

1. ✅ MVP: grafo 3D de memoria con chat básico.
2. Mejorar layout con ForceAtlas2 o Barnes-Hut.
3. Conectar auténticamente con `main.save_memory()` (requiere Opción A).
4. Añadir filtros por tipo de nodo / búsqueda de texto.
5. Modo "evolución temporal": ver cómo cambia el grafo entre turnos.
6. Persistir `memory` en SQLite en lugar de lista en RAM.
